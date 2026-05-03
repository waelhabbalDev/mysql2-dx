declare const LOG_STYLES: {
    info: {
        color: string;
        title: string;
    };
    success: {
        color: string;
        title: string;
    };
    warning: {
        color: string;
        title: string;
    };
    error: {
        color: string;
        title: string;
    };
    query: {
        color: string;
        title: string;
    };
    batch: {
        color: string;
        title: string;
    };
    default: {
        color: string;
        title: string;
    };
};
export type LogType = keyof typeof LOG_STYLES;
export interface LogEntry {
    type: LogType;
    title?: string;
    message: string;
}
declare const logger: {
    log(entry: LogEntry): void;
};
export default logger;
