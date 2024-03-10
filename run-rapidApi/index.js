const axios = require("axios");

const words = [
    "dance", "happy", "sweet", "lovely", "bombastic", "start", "finish", "eat", "repeat", "jargon"
];

const checkApi = async function (pathname, word) {
  try {
    const { data } = await axios.get(
      `https://turbo-thesaurus.p.rapidapi.com/${pathname}?word=${word}`,
      {
        headers: {
          "X-RapidAPI-Key":
            "767d3155f2msha42901efef0d7fap14bbdfjsn24079796b631",
          "X-RapidAPI-Host": "turbo-thesaurus.p.rapidapi.com",
        },
      }
    );
    
    // console.log(`${word} analysed`);
  } catch (err) {
    console.log(`${word} not analysed. ${err.message}`);
  }
};

const evaluteWords = function () {
    const pathnames = ["synonyms", "antonyms", "thesaurus"]

    const newWords = words.map(el => {
        return [pathnames[Math.floor(Math.random() * pathnames.length)], el]
    });

    // console.log(newWords)
    newWords.forEach(el => {
        checkApi(el[0], el[1])
    })
}

module.exports = async function (context, myTimer) {
    evaluteWords()
};
