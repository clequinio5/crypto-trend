//IMPORT
const https = require('https');
const http = require('http');
const cheerio = require('cheerio');
const moment = require('moment');
const fs = require('fs');
const sleep = require('system-sleep');
//const googleTrends = require('google-trends-api');
global.fetch = require('node-fetch');
const cc = require('cryptocompare');
const tradeHistoryPath = './tradeHistory.json';

//PARAMETERS
//const startDate = '01/11/2017 10:00:00'; //DD/MM/YYYY HH:mm:ss
const startDate = undefined;
const botTicker = 6 * 60; //en minutes, ici le bot analyse toutes les 6h
const buyRangeStart = -2 * 24 * 60 // en minutes
const buyRangeEnd = -1 * 24 * 60 //en minutes
const sellRangeStart = -0.5 * 24 * 60 //en minutes
const sellRangeEnd = 0//en minutes

//VARIABLE
const typeEvent = ['Release', 'Rebranding', 'Coin Supply', 'Exchange', 'Conference', 'Community Event', 'Other'];
const mustBeHotEvent = true;

//INITIALISATION
let buyRangeOK = buyRangeStart < buyRangeEnd ? true : false;
let sellRangeOK = sellRangeStart < sellRangeEnd ? true : false;
let tickBuyOK = (buyRangeEnd - buyRangeStart) / botTicker >= 1 ? true : false;
let tickSellOK = (sellRangeEnd - sellRangeStart) / botTicker >= 1 ? true : false;
if (!(buyRangeOK && sellRangeOK && tickBuyOK && tickSellOK)) {
    console.log('Les paramètres doivent être repris');
    process.exit();
}
if (!fs.existsSync(tradeHistoryPath)) {
    fs.writeFileSync(tradeHistoryPath, JSON.stringify([]));
}
let tradeHistory = JSON.parse(fs.readFileSync(tradeHistoryPath, 'utf8'));


let main = async () => {

    console.time('collect events');
    let pathCLI = './CryptoTrend-' + moment().format('DDMMYYYYHHmmss') + '.json';
    let urlsCal = typeEvent.map(el => getEvents(urlCal(el), el));
    let events = await Promise.all(urlsCal).then((results) => {
        let all = [];
        results.map(el => all.push(...el), this);
        return all;
    });
    console.timeEnd('collect events');

    console.time('filter');
    let eventFiltered = [];
    if (mustBeHotEvent) {
        events.filter((el) => {
            if (el.hot) {
                eventFiltered.push(el);
            }
        })
    }
    console.timeEnd('filter');

    // console.time('plateform');
    // let nameOTab = [];
    // console.log(eventFiltered)
    // eventFiltered.forEach((el) => {
    //     nameOTab.push({ "cryptoName": el.cryptoName.toLowerCase(), "cryptoId": el.cryptoId });
    // });
    // nameOTabUniq = [...new Set(nameOTab)];
    // let urlsGecko = nameOTabUniq.map(el => getTradingExchange(urlGecko(el.cryptoName), el.cryptoId));
    // let tradEx = await Promise.all(urlsGecko).then((results) => {
    //     return new Map(results.map((el) => [el.cryptoId, el.tradEx]));
    // });
    // eventFiltered.map((el) => {
    //     let tradExEl = tradEx.get(el.cryptoId);
    //     console.log(tradExEl);
    //     tradExEl.sort(sortByName);
    //     return Object.assign(el, { "tradEx": tradExEl });
    // })
    // console.timeEnd('plateform');

    eventFiltered.sort(sortByDate);

    console.log('Events imported: ' + eventFiltered.length);

    console.time('trade');
    let time = moment().format('x');
    let lastTrade = tradeHistory[tradeHistory.length - 1];
    console.log('lastTrade: ' + JSON.stringify(lastTrade));

    if (!lastTrade || lastTrade.type === 'SELL') {
        console.log('BUY')
        for (var i = 0; i < eventFiltered.length; i++) {
            let nearestEvent = eventFiltered[i];
            let nbBTC = lastTrade ? lastTrade.wallet.BTC : 1;
            let nearestEventDate = moment(nearestEvent.date, 'DD/MM/YYYY').add(12, 'hours').format('x');
            let canBeBuy = Number(time) >= Number(nearestEventDate) + Number(buyRangeStart) * 60 * 1000 && Number(time) <= Number(nearestEventDate) + Number(buyRangeEnd) * 60 * 1000 ? true : false;
            if (canBeBuy) {
                console.log('API KRAKEN BUY ALL CURRENCY WITH BTC');
                let crypto = nearestEvent.cryptoId;
                let price = await cc.price('BTC', crypto);
                console.log("nbBTC: " + nbBTC);
                console.log("priceBef: " + JSON.stringify(price));
                price[crypto] = nbBTC * price[crypto];
                console.log("priceAft: " + JSON.stringify(price));
                nearestEvent.type = 'BUY';
                nearestEvent.tradeDate = moment().format('DD/MM/YYYY HH:mm:ss');
                nearestEvent.wallet = price;
                tradeHistory.push(nearestEvent);
                writeTrade(tradeHistoryPath, JSON.stringify(tradeHistory));
                break;
            }
        }

    } else if (lastTrade.type === 'BUY') {
        console.log('SELL')
        let lastTradeEventDate = moment(lastTrade.date, 'DD/MM/YYYY').add(12, 'hours').format('x');
        let canBeSell = Number(time) >= Number(lastTradeEventDate) + Number(sellRangeStart) * 60 * 1000 ? true : false;
        if (canBeSell) {
            console.log('API KRAKEN SELL ALL CURRENCY TO BTC');
            let crypto = lastTrade.cryptoId;
            let nbCRYPTO = lastTrade.wallet.crypto;
            let price = await cc.price(crypto, 'BTC');
            console.log("nbCRYPTO: " + nbCRYPTO);
            console.log("priceBef: " + JSON.stringify(price));
            price['BTC'] = nbCRYPTO * price['BTC'];
            console.log("priceAft: " + JSON.stringify(price));
            lastTrade.type = 'SELL';
            lastTrade.tradeDate = moment().format('DD/MM/YYYY HH:mm:ss');
            lastTrade.wallet = price;
            tradeHistory.push(lastTrade);
            writeTrade(tradeHistoryPath, JSON.stringify(tradeHistory));
            main();
        }
    } else {
        console.log('Erreur dans le fichier d\'historistion des trades');
        process.exit();
    }
    console.timeEnd('trade');
    console.log('***************')
}

let sortByDate = (a, b) => {
    let dateA = moment(a.date, 'DD/MM/YYYY');
    let dateB = moment(b.date, 'DD/MM/YYYY');
    if (dateA < dateB)
        return -1
    if (dateA > dateB)
        return 1
    return 0
}

let sortByName = (a, b) => {
    let nameA = a.tradExName.toLowerCase()
    let nameB = b.tradExName.toLowerCase()
    if (nameA < nameB)
        return -1
    if (nameA > nameB)
        return 1
    return 0
}

let urlGecko = (name) => {
    return 'https://www.coingecko.com/en/coins/' + name + '/trading_exchanges';
}

let urlCal = (typeEvent) => {
    return 'http://coinmarketcal.com/?form%5Bmonth%5D=&form%5Byear%5D=&form%5Bcoin%5D=&form%5Bcategories%5D%5B%5D=' + typeEvent.replace(' ', '+') + '&form%5Bsort_by%5D=&form%5Bsubmit%5D=';
}

let getCryptObject = (cryptoString) => {
    let tab = cryptoString.split(' ');
    return { "cryptoName": tab[0], "cryptoId": tab[1].substring(1, tab[1].length - 1) };
}

let getEvents = (url, typeEvent) => {
    return new Promise((resolve, reject) => {
        let content = "";
        let req = http.request(url, (res) => {
            res.setEncoding("utf8");
            res.on("data", function (chunk) {
                content += chunk;
            });
            res.on("end", function () {
                let events = [];
                let htmlPage = content.toString();
                let $ = cheerio.load(htmlPage);
                $("article").each(function (i, elem) {
                    let h5 = $(this).children().children();
                    let date = h5.eq(0).children().text();
                    let crypto = h5.eq(1).children().text();
                    let descr = h5.eq(2).text();
                    let hot = h5.eq(2).children().eq(0).attr('data-content') ? true : false;
                    events[i] = Object.assign(getCryptObject(crypto), { "date": moment(date.replace('By ', ''), 'DD MMMM YYYY').format('DD/MM/YYYY'), "descr": descr.split('\n')[0], 'type': typeEvent, 'hot': hot });
                });
                resolve(events);
            });
            res.on('error', function (e) {
                reject(e);
            });

        });
        req.end();
    })
}

// let getTradingExchange = (url, cryptoId) => {
//     return new Promise((resolve, reject) => {
//         let content = "";
//         let req = https.request(url, (res) => {
//             res.setEncoding("utf8");
//             res.on("data", function (chunk) {
//                 content += chunk;
//             });
//             res.on("end", function () {
//                 let tradEx = [];
//                 let htmlPage = content.toString();
//                 let $ = cheerio.load(htmlPage);
//                 $(".table tbody tr").each(function (i, elem) {
//                     let td = $(this).children();
//                     let tradExName = td.eq(0).text();
//                     let tradExPair = td.eq(1).text();
//                     tradEx[i] = { "tradExName": tradExName, "tradExPair": tradExPair };
//                 });
//                 let tradExO = { "cryptoId": cryptoId, "tradEx": tradEx };
//                 resolve(tradExO);
//             });
//             res.on('error', function (e) {
//                 reject(e);
//             });

//         });
//         req.end();
//     })
// }

let writeTrade = (path, text) => {
    if (!fs.existsSync(path)) {
        fs.writeFileSync(path, '');
    }
    fs.writeFileSync(path, text, 'ascii', function (err) {
        if (err) {
            return console.log(err);
        }
    });
}

if (startDate) {
    let startScriptTs = moment();
    let startDateToTs = moment(startDate, 'DD/MM/YYYY HH:mm:ss');
    let timeToSleep = startDateToTs.diff(startScriptTs, 'ms');
    sleep(timeToSleep);
    let bot = setInterval(main, botTicker * 60 * 1000);
    main();
} else {
    let bot = setInterval(main, botTicker * 60 * 1000);
    main();
}




