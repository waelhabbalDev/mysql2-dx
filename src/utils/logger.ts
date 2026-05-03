const LOG_STYLES = {
  info: { color: "\x1b[36m", title: "[INFO]" },
  success: { color: "\x1b[32m", title: "[SUCCESS]" },
  warning: { color: "\x1b[33m", title: "[WARNING]" },
  error: { color: "\x1b[31m", title: "[ERROR]" },
  query: { color: "\x1b[90m", title: "[DB QUERY]" },
  batch: { color: "\x1b[90m", title: "[DB BATCH]" },
  default: { color: "\x1b[0m", title: "" },
};

export type LogType = keyof typeof LOG_STYLES;

export interface LogEntry {
  type: LogType;
  title?: string;
  message: string;
}

function formatLog(entry: LogEntry): string {
  const { type, message } = entry;
  const style = LOG_STYLES[type] || LOG_STYLES.default;
  const title = entry.title || style.title;
  const resetColor = LOG_STYLES.default.color;
  return `${style.color}${title} ${message}${resetColor}`;
}

const logger = {
  log(entry: LogEntry): void {
    switch (entry.type) {
      case "warning":
        console.warn(formatLog(entry));
        break;
      case "error":
        console.error(formatLog(entry));
        break;
      default:
        console.log(formatLog(entry));
        break;
    }
  },
};

export default logger;
