# Development tooling

The project keeps runtime generation deterministic and model-optional. These
tools reduce inspection and evaluation cost without entering the production
rendering path.

## RTK

RTK is installed globally and should be used explicitly for commands whose raw
output is large. It is not registered as a global shell hook, so ordinary shell
behavior remains unchanged.

```bash
rtk npm run check
rtk git diff
rtk git status
```

## ast-grep

ast-grep is installed globally for structural queries and bounded refactors.
Prefer it to loading whole files when the target is a syntax shape.

```bash
ast-grep --pattern 'generateScene($$$ARGS)' --lang ts src
ast-grep --pattern 'scene.primitives.push($$$ARGS)' --lang ts src
```

Always inspect matches before applying a rewrite.

## Repomix

Repomix is installed globally and the project pins its expected behavior through
checked-in configuration. The default configuration compresses
implementation-heavy TypeScript, preserves schema/config files in full, performs
its security scan and fails above 120,000 tokens. Generated bundles are ignored
by Git.

```bash
npm run context:pack
npm run context:pack:focused
```

Use the focused command first. Generate the full project bundle only when a task
really needs cross-domain context.

## Promptfoo

Promptfoo is installed with Homebrew rather than in the application dependency
tree. The checked-in suite is an opt-in, local-only semantic harness using the
existing Ollama `qwen3:30b-instruct` model. It sends no request to a cloud model.

```bash
npm run eval:semantic:validate
npm run eval:semantic
```

The first command validates configuration without calling Ollama. The second is
reserved for the large quality phase and runs serially to avoid loading multiple
large local models at once. The initial cases emphasize unfamiliar hybrid scenes,
because those expose fallback-template failures better than known keywords.

## Global integrity check

All four CLIs resolve from `/opt/homebrew/bin`, outside any project dependency
tree. Run the read-only doctor after system maintenance:

```bash
token-tools-doctor
```

The doctor verifies paths, versions and RTK's destructive-action safety rule. It
does not install, delete or repair anything. RTK never filters destructive command
output, so deletion targets, warnings and failures remain visible.
