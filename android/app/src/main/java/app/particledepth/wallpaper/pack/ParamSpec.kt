package app.particledepth.wallpaper.pack

/**
 * Every setting a pack may carry, with its default and allowed range. Keys are the web renderer's own names
 * (LiteParams in src/lite/LiteEngine.ts), so the web editor exports without renaming: `toLiteParams(params)` is the
 * only mapping, and it runs in TypeScript. The Kotlin side only validates and hands values to the shader.
 *
 * A value outside its range is clamped and reported, never trusted. A key not listed here is ignored and reported.
 * Keep scripts/export-pack.mjs in step with this list: the golden test (PackConfigTest) fails if a key the exporter
 * writes is unknown here.
 */
object ParamSpec {
    /** A number setting. [uniform] is the shader uniform it feeds directly, when the mapping is one to one. */
    class Num(val key: String, val def: Float, val min: Float, val max: Float, val uniform: String? = null, val degrees: Boolean = false)

    /** An on/off setting. [uniform] is the shader flag it feeds (only while the plain DOTS style 0 is drawn). */
    class Flag(val key: String, val def: Boolean, val uniform: String? = null)

    val numbers: List<Num> = listOf(
        // motion
        Num("drift", 0f, 0f, 1f), Num("angle", 0.5f, -6.3f, 6.3f), Num("length", 0.5f, 0f, 1f), Num("lean", 0f, -1f, 1f),
        Num("depth", 0.5f, 0f, 1f), Num("randomness", 0.3f, 0f, 1f), Num("trailSize", 1f, 0f, 4f),
        Num("trailAngle", 0f, -360f, 360f), Num("speed", 1f, 0f, 3f), Num("sway", 0.6f, 0f, 2f), Num("pan", 0.5f, 0f, 1f),
        Num("pSat", 1.2f, 0f, 3f), Num("brightness", 1.15f, 0f, 3f), Num("opacity", 1f, 0f, 1f),
        Num("trailAmount", 0.35f, 0f, 2f), Num("trailLength", 0.6f, -1f, 1.5f), Num("trailStrength", 0.5f, 0f, 2f),
        Num("trailDetail", 0.25f, 0f, 1f), Num("scanMode", 0f, 0f, 6f), Num("scanLevel", 3f, 0f, 10f), Num("style", 0f, 0f, 99f),
        // looks: CHROME, PRISMATIC, AURA, ECSTASY, BLIGHT, REDMET, CHROMA 2, CONVULSIONS, LINED, BLOOD, FUR, ARANCIA, ROCK,
        // CUMULUS, BLEND, GLASS GREEN, CANDY, C-ABR, SHAKE-MASK, SOFTWORD (these two read the glyph atlas)
        Num("chromeBevel", 0.5f, 0f, 1f, "uChromeBevel"), Num("chromeShine", 0.5f, 0f, 1f, "uChromeShine"),
        Num("chromeHue", 0f, -360f, 360f, "uChromeHue", degrees = true), Num("chromeDepth", 0.5f, 0f, 1f, "uChromeDepth"),
        Num("prismaticLength", 0.5f, 0f, 1f, "uPrismLen"), Num("prismaticSpread", 0.5f, 0f, 1f, "uPrismSpread"),
        Num("prismaticGlow", 0.5f, 0f, 1f, "uPrismGlow"), Num("prismaticThreshold", 0.4f, 0f, 1f, "uPrismThr"),
        Num("auraGlow", 0.5f, 0f, 1f, "uAuraGlow"), Num("auraReach", 0.5f, 0f, 1f, "uAuraReach"),
        Num("auraCore", 0.6f, 0f, 1f, "uAuraCore"), Num("auraTint", 0.5f, 0f, 1f, "uAuraTint"),
        Num("ecstasyTint", 0.8f, 0f, 1f, "uEcsTint"), Num("ecstasyDepth", 0.5f, 0f, 1f, "uEcsDepth"),
        Num("ecstasyGlow", 0.5f, 0f, 1f, "uEcsGlow"), Num("ecstasyCore", 0.5f, 0f, 1f, "uEcsCore"),
        Num("blightSpread", 0.5f, 0f, 1f, "uBlSpread"), Num("blightGrain", 0.5f, 0f, 1f, "uBlGrain"),
        Num("blightInk", 0.5f, 0f, 1f, "uBlInk"), Num("blightHaze", 0.5f, 0f, 1f, "uBlHaze"),
        Num("redmetHeat", 0.7f, 0f, 1f, "uRmHeat"), Num("redmetRim", 0.6f, 0f, 1f, "uRmRim"),
        Num("redmetBevel", 0.5f, 0f, 1f, "uRmBevel"),
        Num("chroma2Rim", 0.6f, 0f, 1f, "uC2Rim"), Num("chroma2Spectrum", 0.7f, 0f, 1f, "uC2Spec"),
        Num("chroma2Bevel", 0.5f, 0f, 1f, "uC2Bevel"),
        Num("convulsionsLine", 0.5f, 0f, 1f, "uCvLine"), Num("convulsionsHatch", 0.5f, 0f, 1f, "uCvHatch"),
        Num("convulsionsJitter", 0.5f, 0f, 1f, "uCvJitter"),
        Num("linedCount", 60f, 1f, 400f, "uLinedCount"), Num("linedWeight", 0.6f, 0f, 1f, "uLinedWeight"),
        Num("linedContrast", 0.5f, 0f, 1f, "uLinedContrast"),
        Num("bloodShift", 0.5f, 0f, 1f, "uBloodShift"), Num("bloodBleed", 0.5f, 0f, 1f, "uBloodBleed"),
        Num("bloodGrain", 0.5f, 0f, 1f, "uBloodGrain"),
        Num("furPile", 0.6f, 0f, 1f, "uFurPile"), Num("furLength", 0.4f, 0f, 1f, "uFurLength"), Num("furFuzz", 0.5f, 0f, 1f, "uFurFuzz"),
        Num("aranciaPores", 0.6f, 0f, 1f, "uArPores"), Num("aranciaWeb", 0.6f, 0f, 1f, "uArWeb"),
        Num("aranciaGloss", 0.5f, 0f, 1f, "uArGloss"),
        Num("rockCracks", 0.5f, 0f, 1f, "uRkCracks"), Num("rockGrain", 0.6f, 0f, 1f, "uRkGrain"), Num("rockWear", 0.5f, 0f, 1f, "uRkWear"),
        Num("cumulusPuff", 0.5f, 0f, 1f, "uCuPuff"), Num("cumulusGlow", 0.5f, 0f, 1f, "uCuGlow"), Num("cumulusSoft", 0.5f, 0f, 1f, "uCuSoft"),
        Num("blendAmount", 0.6f, 0f, 1f, "uBnAmt"), Num("blendWarm", 0.4f, 0f, 1f, "uBnWarm"), Num("blendSoft", 0.5f, 0f, 1f, "uBnSoft"),
        Num("glassGreenGloss", 0.85f, 0f, 1f, "uGgGloss"), Num("glassGreenRim", 0.9f, 0f, 1f, "uGgRim"),
        Num("glassGreenDepth", 0.7f, 0f, 1f, "uGgDepth"), Num("glassGreenBevel", 0.65f, 0f, 1f, "uGgBevel"),
        Num("candyGloss", 0.85f, 0f, 1f, "uCdGloss"), Num("candyGlow", 0.7f, 0f, 1f, "uCdGlow"), Num("candyTone", 0.5f, 0f, 1f, "uCdTone"),
        Num("shakeSmear", 0.5f, 0f, 1f, "uShSmear"), Num("shakeCover", 0.3f, 0f, 1f, "uShCover"), Num("shakePatch", 0.5f, 0f, 1f, "uShPatch"),
        Num("softwordGlow", 0.6f, 0f, 1f, "uSwGlow"),
        Num("cabrDisp", 0.85f, 0f, 1f, "uCabrDisp"), Num("cabrGloss", 0.9f, 0f, 1f, "uCabrGloss"), Num("cabrRim", 0.85f, 0f, 1f, "uCabrRim"),
    )

    val flags: List<Flag> = listOf(
        Flag("floatOn", false), Flag("trails", true), Flag("scan", false), Flag("bw", false), Flag("emitOn", true),
        Flag("chromeOn", false, "uChrome"), Flag("prismaticOn", false, "uPrism"), Flag("auraOn", false, "uAura"),
        Flag("ecstasyOn", false, "uEcstasy"), Flag("blightOn", false, "uBlight"), Flag("redmetOn", false, "uRedmet"),
        Flag("chroma2On", false, "uC2On"), Flag("convulsionsOn", false, "uConv"), Flag("linedOn", false, "uLined"),
        Flag("bloodOn", false, "uBlood"), Flag("furOn", false, "uFur"), Flag("aranciaOn", false, "uAr"),
        Flag("rockOn", false, "uRock"), Flag("cumulusOn", false, "uCumulus"), Flag("blendOn", false, "uBnOn"),
        Flag("shakeOn", false, "uShake"), Flag("softwordOn", false, "uSoftword"), Flag("glassGreenOn", false, "uGlassGreen"), Flag("candyOn", false, "uCandy"), Flag("cabrOn", false, "uCabr"),
    )

    /** Nested groups: written as objects in the pack, flattened to "group.key" internally. */
    val fx: List<Num> = listOf(
        Num("black", 0f, 0f, 0.5f), Num("white", 1f, 0.5f, 1f), Num("gamma", 1f, 0.4f, 2.2f), Num("contrast", 0f, -1f, 1f),
        Num("hue", 0f, -180f, 180f), Num("saturation", 1f, 0f, 2f),
    )
    val emit: List<Num> = (0..8).map { Num("r$it", 1f, 0f, 2f) } + listOf(
        Num("spots", 0f, 0f, 8f), Num("scatter", 0.35f, 0f, 1f), Num("lenRand", 1f, 0f, 2f), Num("turn", 0.3f, -1f, 1f),
    )

    /**
     * Keys the web renderer has that this build does not draw yet. They are accepted and ignored, with a warning
     * (the picture still renders as the plain DOTS look). Looks that need the glyph atlas or the post-processing chain.
     */
    val unsupported: Set<String> = setOf(
        "cell", "gap", "styleSet", "colorMode", "invert", "autoLevels", "ink", "paper", "glow",
        "musicLook", "motionFx", "motionAmount", "motionSpeed", "track", "trackOld", "burst", "threeD",
    )

    private val numByKey = numbers.associateBy { it.key }
    private val flagByKey = flags.associateBy { it.key }
    fun num(key: String): Num? = numByKey[key]
    fun flag(key: String): Flag? = flagByKey[key]

    /** Uniform names the renderer needs a location for, besides the fixed base set. */
    val lookUniforms: List<String> = (numbers.mapNotNull { it.uniform } + flags.mapNotNull { it.uniform }).distinct()
}
