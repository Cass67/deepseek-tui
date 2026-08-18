import { execFile } from "node:child_process";

/** Open one validated HTTP(S) URL without invoking a shell. */
export function openExternalUrl(
  raw: string,
  platform = process.platform,
): Promise<void> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Refusing malformed authentication link");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(`Refusing non-HTTP authentication link: ${url.protocol}`);
  }
  const command =
    platform === "darwin"
      ? "open"
      : platform === "win32"
        ? "rundll32"
        : "xdg-open";
  const args =
    platform === "win32"
      ? ["url.dll,FileProtocolHandler", url.href]
      : [url.href];
  return new Promise((resolve, reject) => {
    execFile(command, args, { windowsHide: true }, (error) => {
      if (error)
        reject(
          new Error(`Could not open authentication link: ${error.message}`),
        );
      else resolve();
    });
  });
}
