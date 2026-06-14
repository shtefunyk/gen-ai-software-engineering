# How to run — Homework 4

## Prerequisites
- Node.js >= 18, npm
- Claude Code CLI (`claude`) logged in

## Install
```bash
cd homework-4
npm install
```

## See the bugs (before)
```bash
npm test        # RED — seeded bugs and vuln cause failures
```

## Run the pipeline (one command)
```bash
npm run pipeline      # or ./run-pipeline.sh
```
This invokes `/run-pipeline`, which dispatches the four agents in order and writes
their artifacts under `context/bugs/001-notes-api/`.

## See the fixes (after)
```bash
npm test        # GREEN — Bug Fixer applied the plan; generated tests added
```

## Run the app
```bash
npm start       # http://localhost:3000
```
