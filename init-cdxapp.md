Run the init-cdxapp initializer for the current project.

If the user provided free text after `/init-cdxapp`, treat it as the initial
project request and pass it as one argument to the command. Do not summarize it
away before execution.

Use this command from the current working directory after confirming
`init-cdxapp` is available on `PATH`:

```sh
init-cdxapp "$ARGUMENTS"
```

After the command finishes, report:

- the `.local/` path
- the chat id
- whether initial secrets were moved into the encrypted vault
- any hard stop or conflict file created

Do not print secret values. If the user asks to manage secrets, use:

```sh
init-cdxapp secret <set|get|list|delete>
init-cdxapp vault key <path|export>
init-cdxapp vault reset --yes
```
