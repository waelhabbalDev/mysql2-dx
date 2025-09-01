export type ColorKey = keyof typeof colors;
declare const colors: {
    message: string;
    success: string;
    warning: string;
    danger: string;
    info: string;
    hint: string;
};
export interface LogEntry {
    title?: string;
    message: string;
}
declare const logger: {
    message(entry: LogEntry, color?: ColorKey): string;
    secondary(logEntry: LogEntry): void;
    info(logEntry: LogEntry): void;
    success(logEntry: LogEntry): void;
    warning(logEntry: LogEntry): void;
    error(logEntry: LogEntry): void;
};
export default logger;
