var express = require("express");
const { result, forEach } = require("lodash");
const requestMiddleware = require("../middlewares/request.middleware");
const addOwnerInfo = require("../middlewares/request.middleware");
const { FusionAuthClient } = require("fusionauth-node-client");
const response = require("./response");
const BASE_URL = "/admin/v1";
const { Bot } = require("../models/bot");
const { ConversationLogic } = require("../models/conversationLogic");
const { UserSegment } = require("../models/userSegment");
const { Adapter } = require("../models/adapter");
const fetch = require("node-fetch");

const uuid = require("uuid/v1");
const messageUtils = require("../service/messageUtil");
const BotMessages = messageUtils.BOT;
const programMessages = messageUtils.PROGRAM;
const responseCode = messageUtils.RESPONSE_CODE;
const errorCode = messageUtils.ERRORCODES;

const fusionAuthURL = process.env.FUSIONAUTH_URL;
const fusionAuthAPIKey = process.env.FUSIONAUTH_KEY;
const anonymousBotID = process.env.FA_ANONYMOUS_BOT_ID;

const client = new FusionAuthClient(fusionAuthAPIKey, fusionAuthURL);

const UCI_CORE_URL = `${process.env.UCI_CORE_BASE_URL}/campaign`;

// BOT status = "enabled", "disabled", "draft";

// Refactor this to move to service
async function getAll(req, res) {
  const allCL = await Bot.query();
  res.send({ data: allCL });
}

async function getByID(req, res) {
  const rspObj = req.rspObj;
  const errCode =
    programMessages.EXCEPTION_CODE + "_" + BotMessages.READ.EXCEPTION_CODE;
  try {
    const bot = await Bot.query().findById(req.params.id);
    if (bot) {
      const conversationLogics = await ConversationLogic.query().findByIds(
        bot.logicIDs
      );
      const userSegments = await UserSegment.query()
        .findByIds(bot.users)
        .withGraphFetched("[allService, byIDService, byPhoneService]");
      for (let j = 0; j < conversationLogics.length; j++) {
        const adapterID = conversationLogics[j].adapter;
        conversationLogics[j].adapter = await Adapter.query().findById(
          adapterID
        );
      }
      bot.userSegments = userSegments;
      bot.logic = conversationLogics;
      response.sendSuccessRes(req, bot, res);
    } else {
      response.sendErrorRes(
        req,
        res,
        BotMessages.READ.MISSING_CODE,
        errorCode,
        BotMessages.READ.MISSING_MESSAGE,
        `Bot with id ${req.params.id} not found`,
        errCode
      );
    }
  } catch (e) {
    response.sendErrorRes(
      req,
      res,
      BotMessages.READ.FAILED_CODE,
      errorCode,
      BotMessages.READ.FAILED_MESSAGE,
      e,
      errCode
    );
  }
}

async function get(req, res) {
  const rspObj = req.rspObj;
  const errCode =
    programMessages.EXCEPTION_CODE + "_" + BotMessages.READ.EXCEPTION_CODE;
  try {
    const batchSize = req.query.perPage;
    const page = req.query.page - 1;
    const ownerID = req.body.ownerID;
    const ownerOrgID = req.body.ownerOrgID;
    const isOrgAdmin = true;
    let botsData;
    if (isOrgAdmin) {
      botsData = await Bot.query()
        .where({ ownerOrgID })
        .page(page, batchSize);
    } else {
      botsData = await Bot.query()
        .where({ ownerID, ownerOrgID })
        .page(page, batchSize);
    }
    const data = [];
    for (let i = 0; i < botsData.results.length; i++) {
      let bot = botsData.results[i];
      const conversationLogics = await ConversationLogic.query().findByIds(
        bot.logicIDs
      );
      for (let j = 0; j < conversationLogics.length; j++) {
        const adapterID = conversationLogics[j].adapter;
        conversationLogics[j].adapter = await Adapter.query().findById(
          adapterID
        );
      }
      const userSegments = await UserSegment.query().findByIds(bot.users);
      bot.logic = conversationLogics;
      bot.userSegments = userSegments;
      data.push(bot);
    }

    rspObj.responseCode = responseCode.SUCCESS;
    rspObj.result = { data, total: botsData.total };
    return res.status(200).send(successResponse(rspObj));

    // response.sendSuccessRes(req, { data, total: botsData.total }, res);
  } catch (e) {
    response.sendErrorRes(
      req,
      res,
      BotMessages.READ.FAILED_CODE,
      errorCode,
      BotMessages.READ.FAILED_MESSAGE,
      e,
      errCode
    );
  }
}

async function startByID(req, res) {
  const rspObj = req.rspObj;
  const errCode =
    programMessages.EXCEPTION_CODE + "_" + BotMessages.START.EXCEPTION_CODE;
  try {
    const id = req.params.id;
    fetch(`${UCI_CORE_URL}/start?campaignId=${id}`)
      .then(async (s) => {
        await Bot.query().findById(req.params.id).patch({ status: "enabled" });
        response.sendSuccessRes(req, { status: "Bot Triggered" }, res);
      })
      .catch((e) => {
        response.sendErrorRes(
          req,
          res,
          BotMessages.START.FAILED_CODE,
          errorCode,
          BotMessages.START.FAILED_MESSAGE,
          e,
          errCode
        );
      });
  } catch (e) {
    response.sendErrorRes(
      req,
      res,
      BotMessages.START.FAILED_CODE,
      errorCode,
      BotMessages.START.FAILED_MESSAGE,
      e,
      errCode
    );
  }
}

async function pauseByID(req, res) {
  const rspObj = req.rspObj;
  const errCode =
    programMessages.EXCEPTION_CODE + "_" + BotMessages.PAUSE.EXCEPTION_CODE;
  try {
    const id = req.params.id;
    fetch(`${UCI_CORE_URL}/pause?campaignId=${id}`)
      .then(async (s) => {
        await Bot.query().findById(req.params.id).patch({ status: "disabled" });
        response.sendSuccessRes(req, { status: "Bot Paused" }, res);
      })
      .catch((e) => {
        response.sendErrorRes(
          req,
          res,
          BotMessages.PAUSE.FAILED_CODE,
          errorCode,
          BotMessages.PAUSE.FAILED_MESSAGE,
          e,
          errCode
        );
      });
  } catch (e) {
    response.sendErrorRes(
      req,
      res,
      BotMessages.PAUSE.FAILED_CODE,
      errorCode,
      BotMessages.PAUSE.FAILED_MESSAGE,
      e,
      errCode
    );
  }
}

async function getAllUsers(req, res) {
  const rspObj = req.rspObj;
  const errCode =
    programMessages.EXCEPTION_CODE +
    "_" +
    BotMessages.GET_BY_PARAM.EXCEPTION_CODE;
  try {
    const bot = await Bot.query().findById(req.params.id);
    const userSegment = await UserSegment.query()
      .findByIds(bot.users)
      .withGraphFetched("[allService, byIDService, byPhoneService]");
    console.log({ userSegment });

    const allUsers = await userSegment[0].allService.resolve();
    response.sendSuccessRes(req, allUsers, res);
  } catch (e) {
    response.sendErrorRes(
      req,
      res,
      BotMessages.GET_BY_PARAM.FAILED_CODE,
      errorCode,
      BotMessages.GET_BY_PARAM.FAILED_MESSAGE,
      e,
      errCode
    );
  }
}

async function getByParam(req, res) {
  const rspObj = req.rspObj;
  const ownerID = req.body.ownerID;
  const ownerOrgID = req.body.ownerOrgID;
  const isAdmin = req.body.isAdmin;
  let bot;
  const errCode =
    programMessages.EXCEPTION_CODE +
    "_" +
    BotMessages.GET_BY_PARAM.EXCEPTION_CODE;
  try {
    if (req.query.name) {
      if (isAdmin) {
        bot = (await Bot.query().where({ name: req.query.name }))[0];
      } else {
        bot = (
          await Bot.query().where({ name: req.query.name, ownerID, ownerOrgID })
        )[0];
      }

      if (bot instanceof Bot) {
        // Add logic
        let logic = await ConversationLogic.query().findByIds(bot.logicIDs);
        bot.logic = logic;
        rspObj.responseCode = responseCode.SUCCESS;
        rspObj.result = { data: bot };
        return res.status(200).send(successResponse(rspObj));
      } else rspObj.errCode = BotMessages.GET_BY_PARAM.INCORRECT_NAME_CODE;
      rspObj.errMsg = BotMessages.GET_BY_PARAM.INCORRECT_NAME_MESSAGE;
      rspObj.responseCode = responseCode.CLIENT_ERROR;
      return res
        .status(400)
        .send(errorResponse(rspObj, errCode + errorCode.CODE1));
    } else if (req.query.startingMessage) {
      if (req.query.startingMessage === "") {
        rspObj.errCode = BotMessages.GET_BY_PARAM.MISSING_CODE;
        rspObj.errMsg = BotMessages.GET_BY_PARAM.MISSING_MESSAGE;
        rspObj.responseCode = responseCode.CLIENT_ERROR;
        return res
          .status(400)
          .send(errorResponse(rspObj, errCode + errorCode.CODE1));
      } else {
        // if (isAdmin) {
        const bots = await Bot.query().where({
          startingMessage: req.query.startingMessage,
        });
        // } else {
        //   bot = (
        //     await Bot.query().where({
        //       startingMessage: req.query.startingMessage,
        //       ownerID: ownerID,
        //       ownerOrgID: ownerOrgID,
        //     })
        //   )[0];
        // }
        if (bots.length === 0) {
          rspObj.errCode = BotMessages.GET_BY_PARAM.FAILED_CODE;
          rspObj.errMsg = BotMessages.GET_BY_PARAM.FAILED_MESSAGE;
          rspObj.responseCode = responseCode.CLIENT_ERROR;
          return res
            .status(400)
            .send(errorResponse(rspObj, errCode + errorCode.CODE1));
        } else {
          bot = bots[0];
          console.log({ bot });
          if (bot instanceof Bot) {
            // Add logic
            let logic = await ConversationLogic.query().findByIds(bot.logicIDs);
            bot.logic = logic;
            rspObj.responseCode = responseCode.SUCCESS;
            rspObj.result = { data: bot };
            return res.status(200).send(successResponse(rspObj));
          } else {
            rspObj.errCode = BotMessages.GET_BY_PARAM.FAILED_CODE;
            rspObj.errMsg = BotMessages.GET_BY_PARAM.FAILED_MESSAGE;
            rspObj.responseCode = responseCode.CLIENT_ERROR;
            return res
              .status(400)
              .send(errorResponse(rspObj, errCode + errorCode.CODE1));
          }
        }
      }
    } else {
      rspObj.errCode = BotMessages.GET_BY_PARAM.MISSING_CODE;
      rspObj.errMsg = BotMessages.GET_BY_PARAM.MISSING_MESSAGE;
      rspObj.responseCode = responseCode.CLIENT_ERROR;
      return res
        .status(400)
        .send(errorResponse(rspObj, errCode + errorCode.CODE1));
    }
  } catch (e) {
    console.log(e);
    rspObj.errCode = BotMessages.GET_BY_PARAM.FAILED_CODE;
    rspObj.errMsg = BotMessages.GET_BY_PARAM.FAILED_MESSAGE;
    rspObj.responseCode = responseCode.CLIENT_ERROR;
    return res
      .status(400)
      .send(errorResponse(rspObj, errCode + errorCode.CODE1));
  }
}

async function search(req, res) {
  const rspObj = req.rspObj;
  const isAdmin = req.body.isAdmin;
  const errCode =
    programMessages.EXCEPTION_CODE + "_" + BotMessages.SEARCH.EXCEPTION_CODE;
  try {
    const batchSize = req.query.perPage;
    const page = req.query.page - 1;
    const ownerID = req.body.ownerID;
    const ownerOrgID = req.body.ownerOrgID;
    if (req.query.name) {
      let bots;
      if (req.query.match === "true") {
        if(isAdmin) {
          bots = await Bot.query()
            .where("name", req.query.name)
            .page(page, batchSize);
        }else {
          bots = await Bot.query()
            .where("ownerOrgID", ownerOrgID)
            .where("name", req.query.name)
            .page(page, batchSize);
        }
      } else {
        if(isAdmin) {
          bots = await Bot.query()
            .where("name", "ILIKE", `%${req.query.name}%`)
            .page(page, batchSize);
        }else {
          bots = await Bot.query()
            .where("ownerOrgID", ownerOrgID)
            .where("name", "ILIKE", `%${req.query.name}%`)
            .page(page, batchSize);
        }
      }

      const botsModified = await Promise.all(
        bots.results.map(async (bot) => {
          const conversationLogics = await ConversationLogic.query().findByIds(
            bot.logicIDs
          );
          const userSegments = await UserSegment.query()
            .findByIds(bot.users)
            .withGraphFetched("[allService, byIDService, byPhoneService]");
          for (let j = 0; j < conversationLogics.length; j++) {
            const adapterID = conversationLogics[j].adapter;
            conversationLogics[j].adapter = await Adapter.query().findById(
              adapterID
            );
          }
          bot.userSegments = userSegments;
          bot.logic = conversationLogics;
          return bot;
        })
      );
      // response.sendSuccessRes(req,{ data: botsModified, total: bots.total },res);
      rspObj.responseCode = responseCode.SUCCESS;
      rspObj.result = { data: botsModified, total: bots.total };
      return res.status(200).send(response.successResponse(rspObj));
    } else {
      response.sendErrorRes(
        req,
        res,
        BotMessages.SEARCH.MISSING_CODE,
        errorCode,
        BotMessages.SEARCH.MISSING_MESSAGE,
        BotMessages.SEARCH.MISSING_MESSAGE,
        errCode
      );
    }
  } catch (e) {
    response.sendErrorRes(
      req,
      res,
      BotMessages.SEARCH.FAILED_CODE,
      errorCode,
      BotMessages.SEARCH.FAILED_MESSAGE,
      e,
      errCode
    );
  }
}

async function update(req, res) {
  const rspObj = req.rspObj;
  const errCode =
    programMessages.EXCEPTION_CODE + "_" + BotMessages.UPDATE.EXCEPTION_CODE;
  const data = req.body.data;
  const isExisting = (await Bot.query().findById(req.params.id)) !== undefined;

  const trx = await Bot.startTransaction();

  if (!isExisting) {
    response.sendErrorRes(
      req,
      res,
      BotMessages.UPDATE.BOT_NOT_EXIST_CODE,
      errorCode,
      BotMessages.UPDATE.BOT_NOT_EXIST_MESSAGE,
      BotMessages.UPDATE.BOT_NOT_EXIST_MESSAGE,
      errCode
    );
  } else {
    try {
      if (data.endDate === undefined || data.endDate === "") data.endDate = null;
      if (data.startDate === undefined || data.startDate === "") data.startDate = null;
      // Loop over transformers to verify if they exist or not.
      const userSegments = data.users;
      let isValidUserSegment = true;
      for (let i = 0; i < userSegments.length; i++) {
        isValidUserSegment =
          isValidUserSegment &&
          (await UserSegment.query().findById(userSegments[i])) instanceof
          UserSegment;
      }
      const CLs = data.logic;
      let isValidCL = true;
      for (let i = 0; i < CLs.length; i++) {
        isValidCL =
          isValidCL &&
          (await ConversationLogic.query().findById(CLs[i])) instanceof
          ConversationLogic;
      }
      data.logicIDs = data.logic;
      delete data.logic;

      if (isValidUserSegment && isValidCL) {
        const inserted = await Bot.query(trx)
          .patch(data)
          .findById(req.params.id);
        await trx.commit();
        response.sendSuccessRes(req, inserted, res);
      } else {
        await trx.rollback();
        response.sendErrorRes(
          req,
          res,
          BotMessages.UPDATE.INVALID_USER_SEGMENT_CODE,
          errorCode,
          BotMessages.UPDATE.INVALID_USER_SEGMENT_MESSAGE,
          BotMessages.UPDATE.INVALID_USER_SEGMENT_MESSAGE,
          errCode
        );
      }
    } catch (e) {
      console.error(e);
      await trx.rollback();
      response.sendErrorRes(
        req,
        res,
        BotMessages.UPDATE.FAILED_CODE,
        errorCode,
        BotMessages.UPDATE.FAILED_MESSAGE,
        e,
        errCode
      );
    }
  }
}

async function deleteByID(req, res) {
  const rspObj = req.rspObj;
  const errCode =
    programMessages.EXCEPTION_CODE + "_" + BotMessages.DELETE.EXCEPTION_CODE;
  try {
    if (req.params.id) {
      const transformer = await Bot.query().deleteById(req.params.id);
      response.sendSuccessRes(
        req,
        `Number of CLs deleted: ${transformer}`,
        res
      );
    } else {
      response.sendErrorRes(
        req,
        res,
        BotMessages.DELETE.MISSING_CODE,
        errorCode,
        BotMessages.DELETE.MISSING_MESSAGE,
        BotMessages.DELETE.MISSING_MESSAGE,
        errCode
      );
    }
  } catch (e) {
    response.sendErrorRes(
      req,
      res,
      BotMessages.DELETE.FAILED_CODE,
      errorCode,
      BotMessages.DELETE.FAILED_MESSAGE,
      e,
      errCode
    );
  }
}

const isExact = async (data) => (await Bot.query().where(data).length) > 0;
const isStartingMessageUnique = async (data) => {
  const botsWithStartingMessage = await Bot.query().where({
    startingMessage: data.startingMessage,
  });
  return botsWithStartingMessage.length === 0;
};

async function insert(req, res) {
  const rspObj = req.rspObj;
  const ownerID = req.body.ownerID;
  const ownerOrgID = req.body.ownerOrgID;
  const isAdmin = req.body.isAdmin;
  const errCode =
    programMessages.EXCEPTION_CODE + "_" + BotMessages.CREATE.EXCEPTION_CODE;

  try {
    const data = req.body.data;
    const isExisting = await isExact(data);
    console.log("isExisting", isExisting);
    const isStartingMessageNew = await isStartingMessageUnique(data);

    if (!isStartingMessageNew) {
      response.sendErrorRes(
        req,
        res,
        BotMessages.CREATE.START_MSG_ALREADY_EXIST_CODE,
        errorCode,
        BotMessages.CREATE.START_MSG_ALREADY_EXIST_MESSAGE,
        BotMessages.CREATE.START_MSG_ALREADY_EXIST_MESSAGE,
        errCode
      );
    } else {
      if (isExisting) {
        response.sendErrorRes(
          req,
          res,
          BotMessages.CREATE.ALREADY_EXIST_CODE,
          errorCode,
          BotMessages.CREATE.ALREADY_EXIST_MESSAGE,
          BotMessages.CREATE.ALREADY_EXIST_MESSAGE,
          errCode
        );
      } else {
        const trx = await Bot.startTransaction();
        try {
          // Loop over transformers to verify if they exist or not.
          const userSegments = data.users;
          let isValidUserSegment = true;
          for (let i = 0; i < userSegments.length; i++) {
            isValidUserSegment =
              isValidUserSegment &&
              (await UserSegment.query().findById(userSegments[i])) instanceof
              UserSegment;
          }
          const CLs = data.logic;
          let isValidCL = true;
          for (let i = 0; i < CLs.length; i++) {
            isValidCL =
              isValidCL &&
              (await ConversationLogic.query().findById(CLs[i])) instanceof
              ConversationLogic;
          }

          data.logicIDs = data.logic;
          data.ownerID = ownerID;
          data.ownerOrgID = ownerOrgID;
          delete data.logic;
          if (isValidUserSegment && isValidCL) {
            const inserted = await Bot.query(trx).insert(data);
            await client
              .createApplication(inserted.id, {
                application: {
                  name: inserted.name,
                },
              })
              .then(async (r) => {
                await trx.commit();
                response.sendSuccessRes(req, inserted, res);
              })
              .catch(async (e) => {
                console.error("CP-2-Error", e);
                await trx.rollback();
                response.sendErrorRes(
                  req,
                  res,
                  BotMessages.CREATE.INVALID_TRANSFORMER_CODE,
                  errorCode,
                  BotMessages.CREATE.INVALID_TRANSFORMER_MESSAGE,
                  e.message,
                  errCode
                );
              });
          } else {
            await trx.rollback();
            console.log({ isValidUserSegment, isValidCL });
            if (!isValidCL) {
              response.sendErrorRes(
                req,
                res,
                BotMessages.CREATE.INVALID_CL_CODE,
                errorCode,
                BotMessages.CREATE.INVALID_CL_MESSAGE,
                BotMessages.CREATE.INVALID_CL_MESSAGE,
                errCode
              );
            } else {
              response.sendErrorRes(
                req,
                res,
                BotMessages.CREATE.INVALID_USER_SEGMENT_CODE,
                errorCode,
                BotMessages.CREATE.INVALID_USER_SEGMENT_MESSAGE,
                BotMessages.CREATE.INVALID_USER_SEGMENT_MESSAGE,
                errCode
              );
            }
          }
        } catch (e) {
          console.error(e);
          await trx.rollback();
          response.sendErrorRes(
            req,
            res,
            BotMessages.CREATE.FAILED_CODE,
            errorCode,
            BotMessages.CREATE.INVALID_USER_SEGMENT_MESSAGE,
            e.message,
            errCode
          );
        }
      }
    }
  } catch (e) {
    response.sendErrorRes(
      req,
      res,
      BotMessages.CREATE.FAILED_CODE,
      errorCode,
      BotMessages.CREATE.FAILED_MESSAGE,
      e,
      errCode
    );
  }
}

async function getFederatedUsersByPhone(req, res) {
  const rspObj = req.rspObj;
  const errCode =
    programMessages.EXCEPTION_CODE +
    "_" +
    BotMessages.GET_BY_PARAM.EXCEPTION_CODE;
  try {
    const bot = await Bot.query().findById(req.params.id);
    const userSegment = await UserSegment.query()
      .findByIds(bot.users)
      .withGraphFetched("[allService, byIDService, byPhoneService]");
    console.log({ userSegment });

    const user = await userSegment[0].byPhoneService.getUserByGQL({
      phoneNo: req.params.phoneNo,
    });

    response.sendSuccessRes(req, user, res);
  } catch (e) {
    response.sendErrorRes(
      req,
      res,
      BotMessages.GET_BY_PARAM.FAILED_CODE,
      errorCode,
      BotMessages.GET_BY_PARAM.FAILED_MESSAGE,
      e,
      errCode
    );
  }

  console.log(req.params);
  const userSegment = await UserSegment.query()
    .findById(req.params.id)
    .withGraphFetched("[allService, byIDService, byPhoneService]");
}

function successResponse(data) {
  var response = {};
  response.id = data.apiId;
  response.ver = data.apiVersion;
  response.ts = new Date();
  response.params = getParams(data.msgid, "successful", null, null);
  response.responseCode = data.responseCode || "OK";
  response.result = data.result;
  return response;
}

function errorResponse(data, errCode) {
  var response = {};
  response.id = data.apiId;
  response.ver = data.apiVersion;
  response.ts = new Date();
  response.params = getParams(data.msgId, "failed", data.errCode, data.errMsg);
  response.responseCode = errCode + "_" + data.responseCode;
  response.result = data.result;
  return response;
}

function getParams(msgId, status, errCode, msg) {
  var params = {};
  params.resmsgid = uuid();
  params.msgid = msgId || null;
  params.status = status;
  params.err = errCode;
  params.errmsg = msg;

  return params;
}

module.exports = function (app) {
  app
    .route(BASE_URL + "/bot/all")
    .get(
      requestMiddleware.gzipCompression(),
      requestMiddleware.createAndValidateRequestBody,
      requestMiddleware.checkIfAdmin,
      getAll
    );

  app
    .route(BASE_URL + "/bot/get")
    .get(
      requestMiddleware.gzipCompression(),
      requestMiddleware.createAndValidateRequestBody,
      requestMiddleware.checkIfAdmin,
      requestMiddleware.addOwnerInfo,
      get
    );

  app
    .route(BASE_URL + "/bot/create")
    .post(
      requestMiddleware.gzipCompression(),
      requestMiddleware.createAndValidateRequestBody,
      requestMiddleware.checkIfAdmin,
      requestMiddleware.addOwnerInfo,
      insert
    );

  app
    .route(BASE_URL + "/bot/get/:id")
    .get(
      requestMiddleware.gzipCompression(),
      requestMiddleware.createAndValidateRequestBody,
      requestMiddleware.checkIfAdmin,
      requestMiddleware.addOwnerInfo,
      getByID
    );

  app
    .route(BASE_URL + "/bot/update/:id")
    .post(
      requestMiddleware.gzipCompression(),
      requestMiddleware.createAndValidateRequestBody,
      requestMiddleware.checkIfAdmin,
      requestMiddleware.addOwnerInfo,
      update
    );

  app
    .route(BASE_URL + "/bot/delete/:id")
    .get(
      requestMiddleware.gzipCompression(),
      requestMiddleware.createAndValidateRequestBody,
      requestMiddleware.checkIfAdmin,
      requestMiddleware.addOwnerInfo,
      deleteByID
    );

  app
    .route(BASE_URL + "/bot/getByParam/")
    .get(
      requestMiddleware.gzipCompression(),
      requestMiddleware.createAndValidateRequestBody,
      requestMiddleware.checkIfAdmin,
      requestMiddleware.addOwnerInfo,
      getByParam
    );

  app
    .route(BASE_URL + "/bot/search/")
    .get(
      requestMiddleware.gzipCompression(),
      requestMiddleware.createAndValidateRequestBody,
      requestMiddleware.checkIfAdmin,
      requestMiddleware.addOwnerInfo,
      search
    );

  app
    .route(BASE_URL + "/bot/start/:id")
    .get(
      requestMiddleware.gzipCompression(),
      requestMiddleware.createAndValidateRequestBody,
      requestMiddleware.checkIfAdmin,
      requestMiddleware.addOwnerInfo,
      startByID
    );

  app
    .route(BASE_URL + "/bot/pause/:id")
    .get(
      requestMiddleware.gzipCompression(),
      requestMiddleware.createAndValidateRequestBody,
      requestMiddleware.checkIfAdmin,
      requestMiddleware.addOwnerInfo,
      pauseByID
    );

  app
    .route(BASE_URL + "/bot/getAllUsers/:id")
    .get(
      requestMiddleware.gzipCompression(),
      requestMiddleware.createAndValidateRequestBody,
      requestMiddleware.checkIfAdmin,
      requestMiddleware.addOwnerInfo,
      getAllUsers
    );

  app
    .route(BASE_URL + "/bot/getFederatedUsersByPhone/:id/:phoneNo")
    .get(
      requestMiddleware.gzipCompression(),
      requestMiddleware.createAndValidateRequestBody,
      requestMiddleware.checkIfAdmin,
      requestMiddleware.addOwnerInfo,
      getFederatedUsersByPhone
    );
};
