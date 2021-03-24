const chunks = require("split-array-into-chunks");
const CallsAtATime = 5
const RoundToCount = 2
const RoundTo = require('round-to');
const ObjectsToCsv = require('objects-to-csv');
const EndOfLine = require("os").EOL
const AllowedIntervals = ["1m", "2m", "5m", "15m", "60m", "1d"]
const AllowedRange = ["1d", "5d", "1mo", "3mo", "6mo", "1y", "2y", "5y", "10y", "ytd", "max"]

export interface StockRequestInfo {
  symbol,
  range,
  interval,
}

export interface StockCalculations {
  max,
  min,
  change,
  minMaxCount,
  current,
  isGoingUp
}

export interface StockResult extends StockCalculations, StockCalculations { }

export interface YahooRequest {
  symbols: string[],
  range: "1d" | "5d" | "1mo" | "3mo" | "6mo" | "1y" | "2y" | "5y" | "10y" | "ytd" | "max",
  interval: "1m" | "2m" | "5m" | "15m" | "60m" | "1d",
  token: string
}

/* this needs to be identical in nodeJS and Angular */
import * as Path from "path"

import * as express from "express"
import { isUndefined } from "util"
import { ReadLine } from "readline"
import { normalize } from "path"
import { runInNewContext } from "vm"
import { nextTick } from "process"
import axios from "axios"
import { Chart, Quote, YahooResponse } from "./interfaces"
import { map } from "lodash";

let md5 = require("md5")


class App {
  public Path = require("path")
  public fs = require("fs")

  public express

  constructor() {
    this.express = express()
    this.express.use((req, res, next) => {
      res.setHeader("Access-Control-Allow-Origin", "*")
      res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
      res.header("Access-Control-Allow-Headers", "*")
      res.header("Access-Control-Allow-Credentials", true)

      if (req.method === "OPTIONS") {
        res.end()
        return
      }

      next()
    })

    this.mountRoutes()
  }

  private mountRoutes(): void {
    let bodyParser = require("body-parser")
    //noinspection TypeScriptUnresolvedFunction
    const router = express.Router()

    let folderKeys = ["folder", "dirPath"]

    router.use(express.static(Path.join(__dirname, "../public")))
    const asyncHandler = require("express-async-handler")

    router.use(bodyParser.urlencoded({ limit: "3000kb", extended: true }))
    router.use(bodyParser.json({ limit: "3000kb" }))
    router.use((req, res, next) => {
      console.log(req.originalUrl)
      console.log(req.body)
      folderKeys.forEach((i) => {
        if (req.body[i]) {
          let originalPath = req.body[i]
          try {
            req.body[i] = this.Path.normalize(req.body[i])
          } catch (ex) {
            console.log(`failed normalizing path ${req.body[i]}`)
            req.body[i] = originalPath
          }
        }
      })
      next()
    })
    router.post('/getStocks', async (req: { body: YahooRequest }, res, next) => {
      //      this.fs.writeFileSync(filePath, clearedFileContents[filePath])
      let yahooReq = req.body
      this.getStocks(yahooReq).then(async (calcRes) => {
        try {
          let dataForCsv = calcRes.map(i => this.prepareForCsv(i))
          let csv = new ObjectsToCsv(dataForCsv);
          await csv.toDisk('./results.csv');
          console.log(await csv.toString())
        } catch (ex) {
          Object.assign({ errorSavingToCsv: ex }, calcRes)
        }
        this.sendSuccessResponse(res, { working: true })
      }).catch((error) => {
        next(error)
      })
    })

    router.use(function (err, req, res, next) {
      console.log("err", err)
      if (res.headersSent) {
        return next(err)
      }
      res.status(500)
      res.json({ err: err, message: err.message })
      // do something about the err
    })

    this.express.use("/", router)
  }

  private async getStocks(req: YahooRequest): Promise<StockResult[]> {
    return new Promise(async (resolve, reject) => {
      let interval = req.interval
      let range = req.range

      if (AllowedIntervals.indexOf(interval) === -1) {
        reject("allowed interval values are: " + AllowedIntervals.join(','))
      }
      if (AllowedRange.indexOf(range) === -1) {
        reject("allowed range values are: " + AllowedRange.join(','))
      }

      if (!req.token) req.token = "90be91777fmsh4d0db53c47a0102p1b9749jsn22d531898dd0"

      var axios = require("axios").default;
      let symbols: String[] = req.symbols ? req.symbols : this.fs.readFileSync('./stocks.txt', 'UTF8').split(EndOfLine)
      let results = []
      for (let i = 0; i < symbols.length; i++) {
        let symbol = symbols[i]
        console.log(new Date().toLocaleTimeString(), 'sleeping for ', symbol)
        await this.sleep(4000)
        let options = {
          method: 'GET',
          url: 'https://apidojo-yahoo-finance-v1.p.rapidapi.com/stock/v2/get-chart',
          params: { interval: interval, symbol: symbol, range: range },
          headers: {
            'x-rapidapi-key': req.token,
            'x-rapidapi-host': 'apidojo-yahoo-finance-v1.p.rapidapi.com'
          }
        }
        let yahooRes
        let stockRequestInfo: StockRequestInfo = {
          symbol: symbol,
          interval: interval,
          range: range
        }

        let isError = 'no'
        let calcResult: StockCalculations = this.errorResponse()
        try {
          yahooRes = await axios.request(options)
        } catch (ex) {
          isError = ex.message
        }
        if (!yahooRes) {
          isError = 'no response'
        }
        else if (!yahooRes.data || (yahooRes.data && yahooRes.data.error)) {
          isError = 'no data'
        }

        if (isError === 'no') {
          calcResult = this.processSingleStock(yahooRes.data.chart)
        }

        let calculation: StockResult = Object.assign(stockRequestInfo, calcResult)
        results.push(calculation)
        console.log(calculation)
      }
      resolve(results)
    })
  }

  private processSingleStock(response: Chart): StockCalculations {
    if (!response.result || !response.result[0].indicators) {
      return {
        change: '-',
        isGoingUp: '-',
        max: '-',
        min: '-',
        minMaxCount: '-',
        current: '-'
      }
    }

    let info = response.result[0].indicators.quote[0]
    let length = info.close.length
    let start = info.close[0]
    let end = info.close[length - 1]

    let result: StockCalculations = {
      min: info.close[0],
      max: info.close[0],
      change: end / start,
      minMaxCount: 0,
      current: end,
      isGoingUp: info.close[0] < info.close[1] ? true : false,
    }


    info.close.forEach((i, index) => {
      if (i > result.max) result.max = i
      if (i < result.min) result.min = i
      if (index > 0 && index < length) {
        // min
        if (i < info.close[index - 1] && i < info.close[index + 1]) {
          result.minMaxCount++
          result.isGoingUp = true
        }
        // max
        else if (i > info.close[index - 1] && i > info.close[index + 1]) {
          result.minMaxCount++
          result.isGoingUp = false
        }
      }
    })

    return result
  }

  private sendSuccessResponse(res: express.Response, data: any) {
    res.json(data)
  }

  private sendErrorResponse(res: express.Response, error: any) {
    ; (res as any).error(res, error)
  }

  private prepareForCsv(object: any): any {
    let returned = {}
    for (let key in object) {
      if (typeof object[key] === 'number') returned[key] = RoundTo(object[key], RoundToCount)
      else if (typeof object[key] === 'boolean') returned[key] = object[key].toString()
      else returned[key] = object[key]
    }
    return returned
  }

  private errorResponse(): StockCalculations {
    return {
      change: "xx",
      current: "xx",
      isGoingUp: "xx",
      max: "xx",
      min: "xx",
      minMaxCount: "xx"
    }
  }

  private sleep(time): Promise<any> {
    return new Promise<any>((resolve, reject) => {
      setTimeout(() => resolve(null), time)
    })
  }
}

const port = process.env.PORT || 3000

function runApp() {
  new App().express.listen(port, (err) => {
    if (err) {
      return console.log(err)
    }

    return console.log(`server is listening on ${port}`)
  })
}

export default runApp
