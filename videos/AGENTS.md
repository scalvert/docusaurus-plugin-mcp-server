# Making videos in this repo

This repo makes narrated videos with [oncue](https://github.com/scalvert/oncue). The person you're
working with may not use a terminal. They describe the video, approve the script, listen to the
narration, watch the render, and get sign-offs. You do everything else.

The full workflow (research, captures, writing the script, QA, review) is the make-video skill in
`.claude/skills/make-video/SKILL.md`. Read it before you start a video. This file adds this repo's
rules, and they win where the two differ. After upgrading oncue, run `npx oncue skills` to refresh
the skill.

## Start here

```bash
npx oncue next --json            # every video: its stage and the next steps
npx oncue next <video> --json    # one video
```

Each step says who does it (`agent` or `person`) and, for you, the exact command. A step with
`"ask": true` needs the person's OK first. Do the agent steps, ask the person for the person steps,
then run `next` again. Don't skip a stage.

If a command fails because the machine isn't set up, run `npx oncue doctor --json` and work
through each `fix`. Ask before you install software.

## Talking with the person

- Use plain words. Say "the script", "the voice recording", "the video", "sign-off". Don't say
  props, lock, take, fingerprint, or registry unless they ask.
- Read the script back to them scene by scene before you record it. Recording a real voice costs
  money.
- You can't hear audio. After every recording, ask the person to listen, especially to names,
  acronyms, and URLs.
- For review, run `npx oncue review <video>`. It opens a page with the video, the script, the
  words to listen for, and a feedback box per scene. They paste the feedback back to you.
- Show them what you changed after each round. Don't describe changes they can't see.

## Rules

1. **Ask before** recording narration with a real voice, accepting a render, deploying, committing,
   pushing, or opening a pull request.
2. **Never handle secrets.** The person puts API keys in `.env` themselves. Never ask them to paste
   a key into the chat, and never print `.env`.
3. **Real output only.** Terminal output comes from running the real command (or replaying recorded
   responses). Screens come from real captures. Anything illustrative says so on screen.
4. **Every claim has a source.** Record it in the video's `STORYBOARD.md`.
5. **Never accept or deploy on your own judgment.** A person approves every render and every
   sign-off. Accepted media is never overwritten.
6. Run `npx oncue check <video> --media` before you hand a video back.

## Where things are

| What | Where |
| --- | --- |
| Script (one row per scene) | `projects/<video>/narration.tsv` |
| What's on screen, scene by scene | `projects/<video>/build.ts` |
| Title, summary, sign-offs | `projects/<video>/video.json` |
| Sources and what's real | `projects/<video>/STORYBOARD.md` |
| Real captures | `projects/<video>/capture/` |
| The rendered video | `projects/<video>/renders/<video>-final.mp4` |
| The voice everyone uses | `catalog/voice.json` |
| Brand, sign-off kinds, redaction rules | `oncue.config.ts` |

The build API (scenes, cues, terminals, captures) is in oncue's
[docs/api.md](https://github.com/scalvert/oncue/blob/main/docs/api.md). Copy the closest existing
video when you start a new one: `npx oncue new <folder> --id <id> --title "..." --track <track>`.
