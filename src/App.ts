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
      this.getStocks(yahooReq).then((calcRes) => {
        let csv = new ObjectsToCsv(calcRes);
        csv.toDisk('./results.csv');
        this.sendSuccessResponse(res, calcRes)
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

  private getStocks(req: YahooRequest): Promise<any> {
    return new Promise((resolve, reject) => {
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
      let yahooRequests = req.symbols.map(symbol => {
        let options = {
          method: 'GET',
          url: 'https://apidojo-yahoo-finance-v1.p.rapidapi.com/stock/v2/get-chart',
          params: { interval: interval, symbol: symbol, range: range },
          headers: {
            'x-rapidapi-key': req.token,
            'x-rapidapi-host': 'apidojo-yahoo-finance-v1.p.rapidapi.com'
          }
        };
        console.log('a')
        return axios.request(options)
      })
      Promise.all(yahooRequests).then((yahooResponses: { data: YahooResponse }[]) => {
        let calculations = yahooResponses.map((yahooRes, index) => {
          let stockRequestInfo: StockRequestInfo = {
            symbol: req.symbols[index],
            interval: interval,
            range: range
          }
          let calcResult: StockCalculations = this.processSingleStock(yahooRes.data.chart)
          let calculation: StockResult = Object.assign(stockRequestInfo, calcResult)
          return calculation
        })
        resolve(calculations)
      }).catch((error) => {
        reject(error)
      });
    })
  }

  private processSingleStock(response: Chart): StockCalculations {
    if (!response.result || !response.result[0].indicators) {
      return {
        change: '-',
        isGoingUp: '-',
        max: '-',
        min: '-',
        minMaxCount: '-'
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
