"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const colors = {
    message: "\x1b[0m",
    success: "\x1b[32m",
    warning: "\x1b[33m",
    danger: "\x1b[31m",
    info: "\x1b[36m",
    hint: "\x1b[90m",
};
const logger = {
    message(entry, color = "message") {
        const title = entry.title || color;
        return `${colors[color]}${title}${colors[color]} ${entry.message}`;
    },
    secondary(logEntry) {
        this.message(logEntry, "hint");
    },
    info(logEntry) {
        console.log(this.message(logEntry, "info"));
    },
    success(logEntry) {
        console.log(this.message(logEntry, "success"));
    },
    warning(logEntry) {
        console.log(this.message(logEntry, "warning"));
    },
    error(logEntry) {
        console.log(this.message(logEntry, "danger"));
    },
};
exports.default = logger;
//# sourceMappingURL=logger.js.map