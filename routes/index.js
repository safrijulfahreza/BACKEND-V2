var express = require('express');
var router = express.Router();
const stock_read_log = require('../models/stock_read_log');
const FileSystem = require('fs');

router.use('/export-data', async (req, res) => {
  const list = await stock_read_log
    .aggregate([
      {
        $match: {},
      },
    ])
    .exec();

  FileSystem.writeFile('./stock_read_log.json', JSON.stringify(list), (error) => {
    if (error) throw error;
  });

  console.log('stock_read_log.json exported!');
  res.json({ statusCode: 1, message: 'stock_read_log.json exported!' });
});

router.use('/import-data', async (req, res) => {
  const list = await stock_read_log
    .aggregate([
      {
        $match: {},
      },
    ])
    .exec();

  FileSystem.readFile('./stock_read_log.json', async (error, data) => {
    if (error) throw error;

    const list = JSON.parse(data);

    const deletedAll = await stock_read_log.deleteMany({});

    const insertedAll = await stock_read_log.insertMany(list);

    console.log('stock_read_log.json imported!');
    res.json({ statusCode: 1, message: 'stock_read_log.json imported!' });
  });
});

router.use('/edit-repacking-data', async (req, res) => {
  // Silahkan dikerjakan disini.

  const { company_id, payload, reject_qr_list, new_qr_list } = req.body;

  const newQrPayload = new_qr_list.map((qr) => qr.payload);
  let dataStock = await stock_read_log.findOne({ company_id, payload }).lean();
  let qrRejected = [];
  let newQrList = [];
  if (dataStock) {
    for (const rejectQr of reject_qr_list) {
      const indexOfQrRejected = dataStock.qr_list.findIndex((qr) => rejectQr.payload === qr.payload);
      /** remove rejected qr */
      if (indexOfQrRejected > -1) {
        qrRejected.push(dataStock.qr_list[indexOfQrRejected]);
        dataStock.qr_list.splice(indexOfQrRejected, 1);
      }
    }

    const dataStocksNewQr = await stock_read_log
      .find({
        company_id,
        qr_list: {
          $elemMatch: {
            payload: { $in: newQrPayload },
          },
        },
      })
      .lean();

    /** Get array of object from new qr list, and remove those from previous qr_list data */
    if (dataStocksNewQr && dataStocksNewQr.length) {
      for (const newDataStock of dataStocksNewQr) {
        newQrPayload.forEach((payload) => {
          const indexOfPullQr = newDataStock.qr_list.findIndex((qr) => qr.payload === payload);
          if (indexOfPullQr > -1) {
            newQrList.push(newDataStock.qr_list[indexOfPullQr]);
            newDataStock.qr_list.splice(indexOfPullQr, 1);
          }
        });
        /** Remove qr from previous data */
        await stock_read_log
          .findByIdAndUpdate(newDataStock._id, {
            $set: {
              qty: newDataStock.qr_list.length,
              qr_list: newDataStock.qr_list,
            },
          })
          .lean();
      }
    }

    /** Store qr rejected into DB */
    qrRejected.map((qr) => {
      qr.status = 0;
      qr.status_qc = 1;
      delete qr._id;
    });
    await stock_read_log.insertMany(qrRejected);

    /** Concat qr list */
    dataStock.qr_list = dataStock.qr_list.concat(newQrList);

    /** Update the data */
    const result = await stock_read_log
      .findByIdAndUpdate(dataStock._id, {
        qty: dataStock.qr_list.length,
        qr_list: dataStock.qr_list,
      })
      .lean();

    res.status(200).json({ message: 'success', result });
  } else {
    res.status(404).json({ message: 'data stock not found' });
  }
});

router.use('/', function (req, res, next) {
  res.render('index', { title: 'Express' });
});

module.exports = router;
