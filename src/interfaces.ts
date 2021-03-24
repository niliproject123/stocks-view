export interface Pre {
    timezone: string;
    start: number;
    end: number;
    gmtoffset: number;
}

export interface Regular {
    timezone: string;
    start: number;
    end: number;
    gmtoffset: number;
}

export interface Post {
    timezone: string;
    start: number;
    end: number;
    gmtoffset: number;
}

export interface CurrentTradingPeriod {
    pre: Pre;
    regular: Regular;
    post: Post;
}

export interface TradingPeriods {
    pre: any[][];
    post: any[][];
    regular: any[][];
}

export interface Meta {
    currency: string;
    symbol: string;
    exchangeName: string;
    instrumentType: string;
    firstTradeDate: number;
    regularMarketTime: number;
    gmtoffset: number;
    timezone: string;
    exchangeTimezoneName: string;
    regularMarketPrice: number;
    chartPreviousClose: number;
    previousClose: number;
    scale: number;
    priceHint: number;
    currentTradingPeriod: CurrentTradingPeriod;
    tradingPeriods: TradingPeriods;
    dataGranularity: string;
    range: string;
    validRanges: string[];
}

export interface Quote {
    low: number[];
    close: number[];
    volume: number[];
    high: number[];
    open: number[];
}

export interface Indicators {
    quote: Quote[];
}

export interface Result {
    meta: Meta;
    timestamp: number[];
    indicators: Indicators;
}

export interface Chart {
    result: Result[];
    error?: any;
}

export interface YahooResponse {
    chart: Chart;
    error?
}

