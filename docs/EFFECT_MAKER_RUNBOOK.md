# Effect Maker Runbook (Automated Agent Edition)

Whenever the user provides two images (Source + Target Reference):

## Prompt (paste this or simply provide the two images)

> Make a new effect from the attached image(s).  
> Image 1 = source. Image 2 = target style reference.  
> Follow `.agents/skills/effect-maker/SKILL.md`. Execute the pipeline end-to-end autonomously. Do not ask for manual CLI steps.

---

## Autonomous Agent Execution Steps

1. **Extract style constants:**
   ```bash
   node scripts/extract-style-inputs.mjs <image1> <image2>
   ```
2. **Scaffold the 9 files:**
   ```bash
   node scripts/scaffold-effect.mjs --name "<NAME>" --category "SURFACE" --controls "<c1>,<c2>,<c3>"
   ```
3. **Fill the shader math:**
   Open `src/lite/shaders.ts`, locate `<name>Finish()`, and paste the extracted palette constants and light vector into the matching archetype template from `.agents/skills/effect-maker/SKILL.md`.
4. **Verify:**
   ```bash
   cmd.exe /c npm test
   cmd.exe /c npx tsc --noEmit
   ```
5. **Report to user in 6 brief bullet points.**
