//INTERFACES DE COMPOONENTES
export interface DDialog {
    header: string,
    message: string,
    question: string
    buttonYes: string,
    buttonNo: string
}

export interface Pagination{
    search: string;
    iRows: number;
    start: number;
    limiter: number;
}

export interface Login {
    username: string,
    pwd: string
}

export interface ResponseGet {
    status:  number;
    message: string;
    data: any;
}

export interface ResponseDB_CRUD {
    status:  number;
    message: string;
    insertID: any;
}