const axios = require("axios");
const cheerio = require("cheerio");
require("dotenv").config();
const { CosmosClient } = require("@azure/cosmos");

const endpoint = process.env.DATABASE_URI;
const key = process.env.MASTER_KEY;

const client = new CosmosClient({ endpoint, key });

const databaseID = process.env.DATABASE_ID;
const containerID = process.env.CONTAINER_ID;

const database = client.database(databaseID);
const container = database.container(containerID);

module.exports = async function (context, req) {
  const headers = { "Content-Type": "application/json" };

  try {
    let wordQuery = req.query.word;
    if (!wordQuery)
      return (context.res = {
        status: 400,
        headers,
        body: { code: "QUERY_NOT_FOUND" },
      });

    wordQuery = wordQuery.trim().replace(/\s+/g, " ").toLowerCase();

    const isInvalidQuery = wordQuery.match(/[^a-zA-Z\s-]+/g)

    if (isInvalidQuery)
      return (context.res = {
        status: 400,
        headers,
        body: { code: "INVALID_QUERY" },
      });

    let items = await getItems(wordQuery);

    if (!items)
      return (context.res = {
        status: 500,
        headers,
        body: { code: "INTERNAL_SERVER_ERROR" },
      });
    if (items.length)
      return (context.res = {
        status: 200,
        headers,
        body: getAntonymsData(items[0]),
      });

    let { status, body } = await extractData(wordQuery);
    if (status !== 200) return (context.res = { status, headers, body });

    context.res = {
      status,
      headers,
      body: getAntonymsData({ word: wordQuery, data: body }),
    };

    const containerItem = {
      wordId: `WD-${wordQuery}`,
      word: wordQuery,
      data: body,
    };

    await container.items.create(containerItem);
  } catch (err) {
    context.log(err.message);

    return (context.res = {
      status: 500,
      headers,
      body: { code: "INTERNAL_SERVER_ERROR" },
    });
  }
};

const getAntonymsData = function (arr) {
  const wordArr = { word: arr.word, data: [] };

  for (let i = 0; i < arr.data.length; i++) {
    const el = arr.data[i];
    const wordChunk = { context: el.word, type: el.type, antonyms: [] };

    if (el.antonyms !== "Data not available") {
      el.antonyms.split(",").forEach((chunk) => {
        if (chunk) wordChunk.antonyms.push(chunk);
      });
    } else wordChunk.antonyms = el.antonyms;

    wordArr.data.push(wordChunk);
  }

  return wordArr;
};

const getItems = async function (wordQuery) {
  try {
    const querySpec = {
      query: "SELECT t.word, t.data FROM thesaurus t WHERE t.wordId = @wordId",
      parameters: [{ name: "@wordId", value: `WD-${wordQuery}` }],
    };

    const { resources } = await container.items.query(querySpec).fetchAll();

    return resources;
  } catch (err) {
    context.log(err);

    return false;
  }
};

const extractData = async function (word) {
  let url = `https://www.merriam-webster.com/thesaurus/${word}`;
  let responseData;

  try {
    const { data } = await axios.get(url);

    const $ = cheerio.load(data);

    let contexts = [];

    const typeSections = $(".entry-word-section-container");

    if (typeSections.length) {
      typeSections.each((i, el) => {
        let partsOfSpeech = $(el)
          .find("h2.parts-of-speech")
          .first()
          .text()
          .replace(/\(.+\)/g, "")
          .trim();

        let contextIndex = 1;

        do {
          let contextCon = $(el).find(
            `#thesaurus-entry-${i + 1}-${contextIndex}`
          );

          if (contextCon.length) {
            let contextWord = $(contextCon).find(".as-in-word em").text();

            const contextHtml = $(contextCon).find(".dt").html();

            let contextMeaning = "";
            let contextExample = "";

            if (contextHtml) {
              contextMeaning = contextHtml.replace(/<.+>/g, "").trim();
              contextExample = contextHtml
                .match(/<.+>/g)[0]
                .replace(/\s+/g, " ");
            }

            let contextSynonyms = [];
            let contextAntonyms = [];

            const synonymCon = $(contextCon).find(".sim-list-scored ul li a");
            const antonymCon = $(contextCon).find(".opp-list-scored ul li a");

            if (synonymCon.length) {
              synonymCon.each((i, syn) => {
                let text =
                  $(syn).find(".color-4 .syl").text() ||
                  $(syn).find(".color-3 .syl").text();
                if (!contextSynonyms.includes(text)) contextSynonyms.push(text);
              });
            }

            if (antonymCon.length) {
              antonymCon.each((i, syn) => {
                let text =
                  $(syn).find(".color-4 .syl").text() ||
                  $(syn).find(".color-3 .syl").text();
                if (!contextAntonyms.includes(text)) contextAntonyms.push(text);
              });
            }

            let contextObj = {
              word: contextWord,
              meaning: contextMeaning ? contextMeaning : "Data not available",
              example: contextExample
                ? $(contextExample).text().trim()
                : "Data not available",
              type: partsOfSpeech,
              synonyms: contextSynonyms.length
                ? contextSynonyms.toString()
                : "Data not available",
              antonyms: contextAntonyms.length
                ? contextAntonyms.toString()
                : "Data not available",
            };

            contextIndex += 1;

            if (contextWord) contexts.push(contextObj);
          } else break;
        } while (true);

        // if(partsOfSpeech) partsOfSpeeches.push(partsOfSpeech)
      });
    }

    responseData = { status: 200, body: contexts };
  } catch (err) {
    if (err.code == "ERR_BAD_REQUEST") {
      return (responseData = {
        status: 404,
        body: {
          message: "The word does not have any thesaurus data.",
          code: "DATA_NOT_FOUND",
        },
      });
    }

    responseData = { status: 500, body: { code: "INTERNAL_SERVER_ERROR" } };

    context.log(err);
  }

  return responseData;
};
