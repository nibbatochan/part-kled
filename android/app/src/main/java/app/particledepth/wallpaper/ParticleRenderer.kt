package app.particledepth.wallpaper

import android.content.Context
import android.opengl.GLES30
import android.os.SystemClock
import android.util.Log
import app.particledepth.wallpaper.pack.LoadedPack
import app.particledepth.wallpaper.pack.PackParams
import app.particledepth.wallpaper.pack.ParamSpec
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sin

/**
 * Draws the web studio's DOTS look with the web studio's own shaders (assets/shaders, exported from
 * src/lite/shaders.ts): the point program for the picture's dots and the trail program for the streaming lines.
 * Uniform values mirror liteDefaults and LiteEngine.frame() in src/lite/LiteEngine.ts. Every look flag stays at its
 * GLSL default of 0, so this is the plain DOTS look with FLOW, trails, PAN tilt and idle sway.
 * All calls must be on the GL thread.
 */
class ParticleRenderer(private val context: Context, private val pack: LoadedPack) {
    private val sample: Sample = pack.sample
    /** The live settings: the pack's, with the user's changes on top. Replaced from any thread, read on the GL thread. */
    @Volatile var params: PackParams = pack.config.params
    private val pp: PackParams get() = params
    /** A linked GLSL program and its uniform locations. */
    private class Prog(val id: Int, val loc: Map<String, Int>)

    private var points: Prog? = null
    private var trails: Prog? = null
    private var vbo = 0
    private var vaoPoints = 0
    private var vaoTrails = 0
    private var width = 1
    private var height = 1
    private var density = 1f

    private var time = 0f
    private var lookX = 0f
    private var lookY = 0f

    private val uniformNames: List<String> = listOf(
        "uLoop", "uEmitW", "uEmitX", "uEmitOn", "uView", "uScale", "uOffset", "uTime", "uDrift", "uDepth", "uSpeed", "uDir",
        "uLean", "uHalfW", "uRandom", "uDolly", "uTrailSize", "uTrailAngle", "uPSat", "uLook", "uSway", "uPtr", "uPtrOn",
        "uPtrVel", "uTrackOld", "uBurst", "uCover", "uPointPx", "uBright", "uTrailLen", "uTrailGain", "uTrailAmount",
        "uTrailDetail", "uLightCol", "uLightOn", "uScanOn", "uScan", "uScanMode", "uScanCenter", "uZScale", "uOpacity",
        "uMorph", "uRole", "uScanLevel", "uFx1", "uFx2", "uBW", "uHasImg", "uGridA", "uLineW", "uTrailFade",
        "uImg", "uImg2", "uTexSize", "uAtlas",
    ) + ParamSpec.lookUniforms

    private var picTex = 0
    private var atlasTex = 0

    fun init() {
        val fsSrc = asset("shaders/point.frag.glsl")
        points = buildProgram("points", asset("shaders/point.vert.glsl"), fsSrc)
        trails = buildProgram("trails", asset("shaders/trail.vert.glsl"), fsSrc)
        logLimits()

        // The picture for the look shaders (filters read colour and depth from it): rgb colour, alpha = depth, mipmapped
        val tx = IntArray(1)
        GLES30.glGenTextures(1, tx, 0)
        picTex = tx[0]
        GLES30.glBindTexture(GLES30.GL_TEXTURE_2D, picTex)
        sample.tex.position(0)
        GLES30.glTexImage2D(GLES30.GL_TEXTURE_2D, 0, GLES30.GL_RGBA8, sample.texW, sample.texH, 0, GLES30.GL_RGBA, GLES30.GL_UNSIGNED_BYTE, sample.tex)
        GLES30.glGenerateMipmap(GLES30.GL_TEXTURE_2D)
        GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_MIN_FILTER, GLES30.GL_LINEAR_MIPMAP_LINEAR)
        GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_MAG_FILTER, GLES30.GL_LINEAR)
        GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_WRAP_S, GLES30.GL_CLAMP_TO_EDGE)
        GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_WRAP_T, GLES30.GL_CLAMP_TO_EDGE)

        // The glyph atlas for SHAKE-MASK and SOFTWORD (unit 0)
        val at = IntArray(1)
        GLES30.glGenTextures(1, at, 0)
        atlasTex = at[0]
        GLES30.glBindTexture(GLES30.GL_TEXTURE_2D, atlasTex)
        val atlas = GlyphAtlas.build()
        android.opengl.GLUtils.texImage2D(GLES30.GL_TEXTURE_2D, 0, atlas, 0)
        atlas.recycle()
        GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_MIN_FILTER, GLES30.GL_LINEAR)
        GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_MAG_FILTER, GLES30.GL_LINEAR)
        GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_WRAP_S, GLES30.GL_CLAMP_TO_EDGE)
        GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_WRAP_T, GLES30.GL_CLAMP_TO_EDGE)

        val b = IntArray(1)
        GLES30.glGenBuffers(1, b, 0)
        vbo = b[0]
        GLES30.glBindBuffer(GLES30.GL_ARRAY_BUFFER, vbo)
        sample.buffer.position(0)
        GLES30.glBufferData(GLES30.GL_ARRAY_BUFFER, sample.count * 16, sample.buffer, GLES30.GL_STATIC_DRAW)
        val v = IntArray(2)
        GLES30.glGenVertexArrays(2, v, 0)
        vaoPoints = v[0]
        vaoTrails = v[1]
        // Points: one vertex per particle
        GLES30.glBindVertexArray(vaoPoints)
        GLES30.glEnableVertexAttribArray(0)
        GLES30.glVertexAttribPointer(0, 3, GLES30.GL_FLOAT, false, 16, 0)
        GLES30.glEnableVertexAttribArray(1)
        GLES30.glVertexAttribPointer(1, 4, GLES30.GL_UNSIGNED_BYTE, true, 16, 12)
        // Trails: one line instance per particle (the same buffer, advanced per instance)
        GLES30.glBindVertexArray(vaoTrails)
        GLES30.glEnableVertexAttribArray(0)
        GLES30.glVertexAttribPointer(0, 3, GLES30.GL_FLOAT, false, 16, 0)
        GLES30.glVertexAttribDivisor(0, 1)
        GLES30.glEnableVertexAttribArray(1)
        GLES30.glVertexAttribPointer(1, 4, GLES30.GL_UNSIGNED_BYTE, true, 16, 12)
        GLES30.glVertexAttribDivisor(1, 1)
        GLES30.glBindVertexArray(0)

        GLES30.glDisable(GLES30.GL_DEPTH_TEST)
        GLES30.glDisable(GLES30.GL_CULL_FACE)
        GLES30.glEnable(GLES30.GL_BLEND)
        GLES30.glBlendFunc(GLES30.GL_ONE, GLES30.GL_ONE_MINUS_SRC_COLOR) // screen blend, as the web build
        GLES30.glClearColor(0f, 0f, 0f, 1f)
        checkError("init")
    }

    /** [w] x [h] is the drawing surface in pixels. [density] is screen px per dp, used to size the dots. */
    fun resize(w: Int, h: Int, density: Float) {
        width = max(1, w)
        height = max(1, h)
        this.density = density
        GLES30.glViewport(0, 0, width, height)
    }

    /** [tiltX] and [tiltY] are -1..1, like the web studio's cursor position. */
    fun draw(dtSec: Float, tiltX: Float, tiltY: Float, q: QualityPolicy.Quality) {
        val drawn = max(1000, (sample.count * q.pointShare).toInt())
        val dt = max(0f, min(dtSec, 0.05f))
        time += dt
        // PAN: as LiteEngine.frame(): ease toward target * pan * (0.9, 0.5)
        val k = 1f - exp(-dt * SpikeConfig.TILT_EASE)
        val pan = pp.n("pan")
        lookX += (tiltX * pan * 0.9f - lookX) * k
        lookY += (tiltY * pan * 0.5f - lookY) * k
        // Idle sway, as the web build
        val sw = pp.n("sway")
        val swayX = (sin(time * 0.23f) * 0.6f + sin(time * 0.11f + 1.3f) * 0.4f) * sw
        val swayY = (sin(time * 0.17f + 0.6f) * 0.6f + sin(time * 0.09f) * 0.4f) * sw * 0.6f

        // Layout: contain (the whole picture fits the screen) times ZOOM, as LiteEngine.relayout(); world height = 1
        val aspect = sample.aspect
        // Render scale: below 1 the scene is drawn into a smaller offscreen texture and stretched to the screen.
        // (A wallpaper surface cannot be resized, setFixedSize throws.) The picture, dots and trails shrink with it.
        val rs = if (q.renderScale >= 0.99f) 1f else q.renderScale
        val rw = if (rs == 1f) width else max(2, (width * rs).roundToInt())
        val rh = if (rs == 1f) height else max(2, (height * rs).roundToInt())
        val scale = min(rh.toFloat(), rw / aspect) * SpikeConfig.ZOOM
        val pointPx = max(1, (density * rs).roundToInt()).toFloat()
        val area = scale * scale * aspect * sample.subjectFraction
        val cover = drawn * pointPx * pointPx / max(area, 1f)
        val dirLen = 0.45f + 0.55f * pp.n("length")
        val frame = Frame(scale, aspect, pointPx, cover, dirLen, swayX, swayY, rw, rh)

        if (rs < 1f) bindOffscreen(rw, rh) else GLES30.glBindFramebuffer(GLES30.GL_FRAMEBUFFER, 0)
        GLES30.glViewport(0, 0, rw, rh)
        GLES30.glClear(GLES30.GL_COLOR_BUFFER_BIT)

        val p = points ?: return
        GLES30.glUseProgram(p.id)
        setUniforms(p, frame)
        GLES30.glBindVertexArray(vaoPoints)
        GLES30.glDrawArrays(GLES30.GL_POINTS, 0, drawn)

        val t = trails
        val trailCount = (drawn * q.trailShare).toInt()
        if (t != null && pp.n("drift") > 0.02f && pp.on("trails") && pp.n("trailAmount") > 0f && trailCount > 0) {
            GLES30.glUseProgram(t.id)
            setUniforms(t, frame)
            GLES30.glUniform1f(t.loc["uLineW"] ?: -1, 1f)
            GLES30.glUniform1f(t.loc["uTrailFade"] ?: -1, 1f)
            GLES30.glBindVertexArray(vaoTrails)
            GLES30.glDrawArraysInstanced(GLES30.GL_LINES, 0, 2, trailCount)
        }
        GLES30.glBindVertexArray(0)
        if (rs < 1f) blitToScreen()
    }

    // ---- offscreen target for render scale ----

    private var fbo = 0
    private var fboTex = 0
    private var fboW = 0
    private var fboH = 0
    private var blitProg = 0

    private fun bindOffscreen(w: Int, h: Int) {
        if (fbo == 0) {
            val i = IntArray(1)
            GLES30.glGenFramebuffers(1, i, 0); fbo = i[0]
            GLES30.glGenTextures(1, i, 0); fboTex = i[0]
        }
        if (w != fboW || h != fboH) {
            GLES30.glBindTexture(GLES30.GL_TEXTURE_2D, fboTex)
            GLES30.glTexImage2D(GLES30.GL_TEXTURE_2D, 0, GLES30.GL_RGBA8, w, h, 0, GLES30.GL_RGBA, GLES30.GL_UNSIGNED_BYTE, null)
            GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_MIN_FILTER, GLES30.GL_LINEAR)
            GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_MAG_FILTER, GLES30.GL_LINEAR)
            GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_WRAP_S, GLES30.GL_CLAMP_TO_EDGE)
            GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_WRAP_T, GLES30.GL_CLAMP_TO_EDGE)
            GLES30.glBindFramebuffer(GLES30.GL_FRAMEBUFFER, fbo)
            GLES30.glFramebufferTexture2D(GLES30.GL_FRAMEBUFFER, GLES30.GL_COLOR_ATTACHMENT0, GLES30.GL_TEXTURE_2D, fboTex, 0)
            fboW = w; fboH = h
            val st = GLES30.glCheckFramebufferStatus(GLES30.GL_FRAMEBUFFER)
            if (st != GLES30.GL_FRAMEBUFFER_COMPLETE) Log.e(TAG, "offscreen target incomplete: 0x${st.toString(16)}")
        } else {
            GLES30.glBindFramebuffer(GLES30.GL_FRAMEBUFFER, fbo)
        }
    }

    /** Stretch the offscreen texture over the whole screen (bilinear). */
    private fun blitToScreen() {
        if (blitProg == 0) {
            val vs = compile(GLES30.GL_VERTEX_SHADER, BLIT_VERT)
            val fs = compile(GLES30.GL_FRAGMENT_SHADER, BLIT_FRAG)
            blitProg = GLES30.glCreateProgram()
            GLES30.glAttachShader(blitProg, vs); GLES30.glAttachShader(blitProg, fs)
            GLES30.glLinkProgram(blitProg)
            GLES30.glDeleteShader(vs); GLES30.glDeleteShader(fs)
        }
        GLES30.glBindFramebuffer(GLES30.GL_FRAMEBUFFER, 0)
        GLES30.glViewport(0, 0, width, height)
        GLES30.glDisable(GLES30.GL_BLEND)
        GLES30.glUseProgram(blitProg)
        GLES30.glActiveTexture(GLES30.GL_TEXTURE0)
        GLES30.glBindTexture(GLES30.GL_TEXTURE_2D, fboTex)
        GLES30.glUniform1i(GLES30.glGetUniformLocation(blitProg, "t"), 0)
        GLES30.glBindVertexArray(vaoPoints) // any VAO: the vertex shader reads gl_VertexID only
        GLES30.glDrawArrays(GLES30.GL_TRIANGLE_STRIP, 0, 4)
        GLES30.glBindVertexArray(0)
        GLES30.glEnable(GLES30.GL_BLEND)
    }

    fun release() {
        points?.let { GLES30.glDeleteProgram(it.id) }
        trails?.let { GLES30.glDeleteProgram(it.id) }
        if (picTex != 0) GLES30.glDeleteTextures(1, intArrayOf(picTex), 0)
        if (atlasTex != 0) GLES30.glDeleteTextures(1, intArrayOf(atlasTex), 0)
        picTex = 0; atlasTex = 0
        if (vbo != 0) GLES30.glDeleteBuffers(1, intArrayOf(vbo), 0)
        if (vaoPoints != 0) GLES30.glDeleteVertexArrays(2, intArrayOf(vaoPoints, vaoTrails), 0)
        if (fbo != 0) { GLES30.glDeleteFramebuffers(1, intArrayOf(fbo), 0); GLES30.glDeleteTextures(1, intArrayOf(fboTex), 0) }
        if (blitProg != 0) GLES30.glDeleteProgram(blitProg)
        points = null; trails = null; vbo = 0; vaoPoints = 0; vaoTrails = 0; fbo = 0; fboTex = 0; fboW = 0; fboH = 0; blitProg = 0
    }

    private class Frame(
        val scale: Float, val aspect: Float, val pointPx: Float, val cover: Float,
        val dirLen: Float, val swayX: Float, val swayY: Float, val rw: Int, val rh: Int,
    )

    private fun setUniforms(p: Prog, f: Frame) {
        val l = p.loc
        fun f1(n: String, a: Float) = GLES30.glUniform1f(l[n] ?: -1, a)
        fun f2(n: String, a: Float, b: Float) = GLES30.glUniform2f(l[n] ?: -1, a, b)
        fun f3(n: String, a: Float, b: Float, c: Float) = GLES30.glUniform3f(l[n] ?: -1, a, b, c)
        fun f4(n: String, a: Float, b: Float, c: Float, d: Float) = GLES30.glUniform4f(l[n] ?: -1, a, b, c, d)
        fun n(key: String) = pp.n(key)
        val deg = (PI / 180.0).toFloat()

        // The look shaders sample the picture
        GLES30.glActiveTexture(GLES30.GL_TEXTURE1)
        GLES30.glBindTexture(GLES30.GL_TEXTURE_2D, picTex)
        GLES30.glActiveTexture(GLES30.GL_TEXTURE0)
        GLES30.glBindTexture(GLES30.GL_TEXTURE_2D, atlasTex)
        GLES30.glUniform1i(l["uAtlas"] ?: -1, 0)
        GLES30.glUniform1i(l["uImg"] ?: -1, 1)
        GLES30.glUniform1i(l["uImg2"] ?: -1, 1)
        f2("uTexSize", sample.texW.toFloat(), sample.texH.toFloat())
        f1("uHasImg", 1f)

        // Same values as LiteEngine.frame() setU(), read from the pack
        f1("uLoop", 0f)
        GLES30.glUniform1fv(l["uEmitW"] ?: -1, 9, FloatArray(9) { pp.emit("r$it") }, 0)
        f4("uEmitX", pp.emit("spots"), pp.emit("scatter"), pp.emit("lenRand"), pp.emit("turn"))
        f1("uEmitOn", if (pp.on("emitOn")) 1f else 0f)
        f2("uView", f.rw.toFloat(), f.rh.toFloat())
        f1("uScale", f.scale)
        val floatY = if (pp.on("floatOn")) (sin(time * 0.7f) * 0.012f + sin(time * 0.37f + 1f) * 0.006f) * f.scale else 0f
        f2("uOffset", 0f, SpikeConfig.OFFSET_Y * f.rh + floatY)
        f1("uTime", time)
        f1("uDrift", n("drift"))
        f1("uDepth", n("depth"))
        f1("uSpeed", n("speed"))
        f2("uDir", cos(n("angle")) * f.dirLen, sin(n("angle")) * f.dirLen)
        f1("uLean", n("lean"))
        f1("uHalfW", f.aspect / 2f)
        f1("uRandom", n("randomness"))
        f1("uDolly", 0f)
        f1("uTrailSize", n("trailSize"))
        f1("uTrailAngle", n("trailAngle") * deg)
        f1("uPSat", n("pSat"))
        f2("uLook", lookX, lookY)
        f2("uSway", f.swayX, f.swayY)
        f2("uPtr", 0f, 0f)
        f1("uPtrOn", 0f) // no touch in the wallpaper MVP
        f2("uPtrVel", 0f, 0f)
        f1("uTrackOld", 0f)
        f4("uBurst", 0f, 0f, 0f, 0f)
        f1("uCover", f.cover)
        f1("uPointPx", f.pointPx)
        f1("uBright", n("brightness"))
        f1("uTrailLen", 0.5f * n("trailLength"))
        f1("uTrailGain", n("trailStrength"))
        f1("uTrailAmount", n("trailAmount"))
        f1("uTrailDetail", n("trailDetail"))
        val light = pp.light
        f3("uLightCol", light?.get(0) ?: 0f, light?.get(1) ?: 0f, light?.get(2) ?: 0f)
        f1("uLightOn", if (light != null) 1f else 0f)
        val scanOn = pp.on("scan") && n("scanMode").toInt() != BURST_MODE // BURST needs a touch; not in the wallpaper
        f1("uScanOn", if (scanOn) 1f else 0f)
        f1("uScan", (time * SCAN_RATE) % 1f)
        f1("uScanMode", n("scanMode"))
        f2("uScanCenter", 0f, 0f)
        f1("uZScale", n("depth") * 0.275f)
        f1("uOpacity", n("opacity"))
        f1("uMorph", 0f)
        f1("uRole", 0f)
        f1("uScanLevel", n("scanLevel"))
        f4("uFx1", pp.fx("black"), pp.fx("white"), pp.fx("gamma"), pp.fx("contrast"))
        f2("uFx2", pp.fx("hue") * deg, pp.fx("saturation"))
        f1("uBW", if (pp.on("bw")) 1f else 0f)
        f1("uGridA", 0f)

        // Looks: every number goes to its uniform; every on/off to its flag. Style 0 is the only style drawn.
        for (num in ParamSpec.numbers) {
            val u = num.uniform ?: continue
            f1(u, n(num.key) * if (num.degrees) deg else 1f)
        }
        for (flag in ParamSpec.flags) {
            val u = flag.uniform ?: continue
            f1(u, if (pp.on(flag.key)) 1f else 0f)
        }
    }

    private fun buildProgram(name: String, vsSrc: String, fsSrc: String): Prog {
        val t0 = SystemClock.elapsedRealtime()
        val key = vsSrc + fsSrc
        val cached = ProgramCache.load(context, key)
        val id = cached ?: run {
            val vs = compile(GLES30.GL_VERTEX_SHADER, vsSrc)
            val fs = compile(GLES30.GL_FRAGMENT_SHADER, fsSrc)
            val p = GLES30.glCreateProgram()
            GLES30.glProgramParameteri(p, GLES30.GL_PROGRAM_BINARY_RETRIEVABLE_HINT, GLES30.GL_TRUE)
            GLES30.glAttachShader(p, vs)
            GLES30.glAttachShader(p, fs)
            GLES30.glLinkProgram(p)
            val ok = IntArray(1)
            GLES30.glGetProgramiv(p, GLES30.GL_LINK_STATUS, ok, 0)
            if (ok[0] == 0) error("$name link failed: " + GLES30.glGetProgramInfoLog(p))
            GLES30.glDeleteShader(vs)
            GLES30.glDeleteShader(fs)
            ProgramCache.save(context, key, p)
            p
        }
        val loc = uniformNames.associateWith { GLES30.glGetUniformLocation(id, it) }
        Log.i(
            TAG,
            "$name shader ${if (cached != null) "loaded from cache" else "compiled+linked"} in ${SystemClock.elapsedRealtime() - t0} ms; " +
                "uniforms not found (optimised out or not used): ${loc.filterValues { it == -1 }.keys}"
        )
        return Prog(id, loc)
    }

    private fun asset(path: String): String = context.assets.open(path).bufferedReader().use { it.readText() }

    private fun compile(type: Int, src: String): Int {
        val s = GLES30.glCreateShader(type)
        GLES30.glShaderSource(s, src)
        GLES30.glCompileShader(s)
        val ok = IntArray(1)
        GLES30.glGetShaderiv(s, GLES30.GL_COMPILE_STATUS, ok, 0)
        if (ok[0] == 0) {
            val log = GLES30.glGetShaderInfoLog(s)
            GLES30.glDeleteShader(s)
            error("shader compile failed: $log")
        }
        return s
    }

    /** Answers open question K3 in docs/RESEARCH_ANDROID_LIVE_WALLPAPER.md: log what this GPU allows. */
    private fun logLimits() {
        val i = IntArray(2)
        GLES30.glGetIntegerv(GLES30.GL_MAX_VERTEX_UNIFORM_VECTORS, i, 0)
        val pt = FloatArray(2)
        GLES30.glGetFloatv(GLES30.GL_ALIASED_POINT_SIZE_RANGE, pt, 0)
        Log.i(
            TAG,
            "GL ${GLES30.glGetString(GLES30.GL_VERSION)} | ${GLES30.glGetString(GLES30.GL_RENDERER)} | " +
                "max vertex uniform vectors ${i[0]} | point size ${pt[0]}..${pt[1]}"
        )
    }

    private fun checkError(where: String) {
        val e = GLES30.glGetError()
        if (e != GLES30.GL_NO_ERROR) Log.e(TAG, "GL error 0x${e.toString(16)} after $where")
    }

    companion object {
        const val TAG = "PDS"
        private const val SCAN_RATE = 0.155f // the web studio's scan speed (LiteEngine SCAN_RATE)
        private const val BURST_MODE = 5     // scan style BURST (WebEngine BURST_MODE)
        private const val BLIT_VERT = """#version 300 es
out vec2 uv;
void main() {
    vec2 p = vec2(float(gl_VertexID & 1), float((gl_VertexID >> 1) & 1));
    uv = p;
    gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
"""
        private const val BLIT_FRAG = """#version 300 es
precision mediump float;
uniform sampler2D t;
in vec2 uv;
out vec4 o;
void main() { o = texture(t, uv); }
"""
    }
}
