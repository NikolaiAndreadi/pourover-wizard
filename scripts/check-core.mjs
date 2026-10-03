import ts from "typescript";

const config = ts.readConfigFile("tsconfig.core.json", ts.sys.readFile);
if (config.error) {
  console.error(
    ts.flattenDiagnosticMessageText(config.error.messageText, "\n"),
  );
  process.exit(1);
}
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, ".");
const errors = parsed.errors.filter((error) => error.code !== 18003);
if (errors.length) {
  console.error(
    errors
      .map((error) => ts.flattenDiagnosticMessageText(error.messageText, "\n"))
      .join("\n"),
  );
  process.exit(1);
}
if (parsed.fileNames.length === 0) {
  console.log(
    "Core typecheck: no domain modules yet. DOM-free configuration ready.",
  );
} else {
  const diagnostics = ts.getPreEmitDiagnostics(
    ts.createProgram(parsed.fileNames, parsed.options),
  );
  if (diagnostics.length) {
    console.error(
      ts.formatDiagnosticsWithColorAndContext(diagnostics, {
        getCurrentDirectory: ts.sys.getCurrentDirectory,
        getCanonicalFileName: (file) => file,
        getNewLine: () => "\n",
      }),
    );
    process.exitCode = 1;
  }
}
