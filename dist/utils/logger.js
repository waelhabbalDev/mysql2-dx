"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const LOG_STYLES = {
    // Type      Color Code      Default Title
    info: { color: "\x1b[36m", title: "[INFO]" }, // Cyan
    success: { color: "\x1b[32m", title: "[SUCCESS]" }, // Green
    warning: { color: "\x1b[33m", title: "[WARNING]" }, // Yellow
    error: { color: "\x1b[31m", title: "[ERROR]" }, // Red
    query: { color: "\x1b[90m", title: "[DB QUERY]" }, // Grey (Hint)
    batch: { color: "\x1b[90m", title: "[DB BATCH]" }, // Grey (Hint)
    default: { color: "\x1b[0m", title: "" }, // Reset
};
function formatLog(entry) {
    const { type, message } = entry;
    const style = LOG_STYLES[type] || LOG_STYLES.default;
    const title = entry.title || style.title;
    const resetColor = LOG_STYLES.default.color;
    return `${style.color}${title} ${message}${resetColor}`;
}
const logger = {
    log(entry) {
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
exports.default = logger;
//# sourceMappingURL=logger.js.map