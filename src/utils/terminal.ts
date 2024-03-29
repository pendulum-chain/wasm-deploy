import readline from "node:readline";

export interface StyledChunk {
  text: string;
  color?: keyof typeof ANSI_COLORS;
  underlined?: boolean;
  spinning?: boolean;
}

const ANSI_COLORS = {
  black: 30,
  red: 31,
  green: 32,
  yellow: 33,
  blue: 34,
  magenta: 35,
  cyan: 36,
  white: 37,
};

export type StyledText = StyledChunk[];

export function stringifyStyledText(
  styledText: StyledText,
  maxLength: number | undefined,
  spinningIndex: number
): string {
  const terminal = process.env.TERM ?? "";
  const colorTerminal = process.env.COLORTERM;
  const supportsColor = colorTerminal === "truecolor" || terminal.endsWith("-256") || terminal.endsWith("-256color");

  let result = "";
  let visibleLength = 0;

  for (const chunk of styledText) {
    const { color, underlined, spinning } = chunk;
    let { text } = chunk;

    if (spinning) {
      text += ".".repeat((spinningIndex % 3) + 1);
    }

    if (maxLength !== undefined && visibleLength + text.length > maxLength) {
      text = text.slice(0, maxLength - visibleLength);
    }

    visibleLength += text.length;

    if (supportsColor && (color !== undefined || underlined === true)) {
      let prefix;
      if (underlined !== true) {
        prefix = `\x1b[${ANSI_COLORS[color!]}m`;
      } else if (color === undefined) {
        prefix = `\x1b[4m`;
      } else {
        prefix = `\x1b[${ANSI_COLORS[color]};4m`;
      }
      result += `${prefix}${text}\x1b[0m`;
    } else {
      result += text;
    }

    if (maxLength !== undefined && visibleLength >= maxLength) {
      break;
    }
  }

  return result;
}

function showCursor() {
  process.stdout.write("\x1b[?25h");
}

function hideCursor() {
  process.stdout.write("\x1b[?25l");
}

export async function createAnimatedTextContext(
  execute: (
    updateDynamicText: (newLines: StyledText[]) => void,
    addStaticText: (lines: StyledText[], removeDynamicText: boolean) => void
  ) => Promise<void>
): Promise<boolean> {
  let lines: StyledText[] = [];
  let inputReader: readline.Interface | undefined;
  let spinningIndex: number = 0;

  if (process.stdout.isTTY) {
    inputReader = readline.createInterface({
      input: process.stdin,
      output: undefined,
      terminal: true,
    });

    inputReader?.on("SIGINT", () => {
      showCursor();
      process.exit();
    });

    hideCursor();
  }

  const updateDynamicText = (
    newLines: StyledText[],
    ignoreScreenMeasures = false,
    newStaticText: StyledText[] = []
  ) => {
    if (process.stdout.isTTY) {
      const [noOfTerminalColumns, noOfTerminalRows] = process.stdout.getWindowSize();

      process.stdout.cursorTo(0);
      const rowsToMoveUp = ignoreScreenMeasures ? lines.length : Math.min(lines.length, noOfTerminalRows);
      if (rowsToMoveUp > 0) {
        process.stdout.moveCursor(0, -rowsToMoveUp + 1);
      }

      if (lines.length <= noOfTerminalRows) {
        for (const line of newStaticText) {
          process.stdout.write(stringifyStyledText(line, undefined, spinningIndex));
          process.stdout.clearLine(1);
          process.stdout.write("\n");
        }
      }

      const linesToSkip = ignoreScreenMeasures ? 0 : Math.max(0, lines.length - noOfTerminalRows);
      const linesToPrint = newLines.slice(linesToSkip);

      let firstLine = true;
      for (const line of linesToPrint) {
        if (firstLine === false) {
          process.stdout.write("\n");
        }
        process.stdout.write(
          stringifyStyledText(line, ignoreScreenMeasures ? undefined : noOfTerminalColumns, spinningIndex)
        );
        process.stdout.clearLine(1);
        firstLine = false;
      }

      lines = newLines;
    }
  };

  const addStaticText = (newStaticText: StyledText[], removeDynamicText: boolean) => {
    updateDynamicText(removeDynamicText ? [] : lines, false, newStaticText);
  };

  const spinningInterval = setInterval(() => {
    spinningIndex++;
    updateDynamicText(lines);
  }, 500);

  try {
    await execute(updateDynamicText, addStaticText);
    updateDynamicText(lines, true);
    return true;
  } catch (error) {
    updateDynamicText(lines, true);
    console.error("\nAn error occurred");
    console.error((error as Error).message);
    console.error(error as Error);
    return false;
  } finally {
    if (process.stdout.isTTY) {
      showCursor();
      process.stdout.write("\n");
    }
    clearInterval(spinningInterval);

    if (process.stdout.isTTY) {
      inputReader?.close();
      inputReader = undefined;
    }
  }
}
