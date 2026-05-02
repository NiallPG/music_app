# Music App

Spotify artist discovery app with three layers:

- React + Tailwind UI in `src/App.tsx`
- Shell-driven workflow commands in `scripts/workflow.sh`
- Lua listening rules in `workflows/listening_rules.lua`

## Run It Yourself

Create a `.env` file with Spotify client credentials:

```sh
SPOTIFY_CLIENT_ID=your-client-id
SPOTIFY_CLIENT_SECRET=your-client-secret
```

Then use the workflow layer:

```sh
npm install
npm run workflow
npm run workflow:validate
npm run workflow:dev
```

Individual commands are also available:

```sh
npm run workflow:ui
npm run workflow:api
```

## Lua Rules

The server reads `workflows/listening_rules.lua` to score an artist's albums and singles. Edit that file to change the recommendation strategy shown in the UI's Lua workflow panel.
