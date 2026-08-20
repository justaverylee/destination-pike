import { createResponse, json, error } from "itty-router";

async function get(request, env) {
  const { results } = await env.wordcloudDB
    .prepare(
      "SELECT word, COUNT(word) AS frequency " +
        "FROM words " +
        "GROUP BY word " +
        "ORDER BY frequency DESC;",
    )
    .run();
  return json(results.map((obj) => [obj.word, obj.frequency]));
}

async function post(request, env) {
  const turnstileSecret = await env.wordcloudTurnstileSecret.get();
  const ip =
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("X-Forwarded-For") ||
    "unknown";
  const ref = request.headers.get("referer");
  const name = request.content.get("name");
  const word = request.content.get("word");
  const token = request.content.get("token");

  const status = await checkToken(turnstileSecret, ip, token);
  if (!status.success) {
    console.warn("Turnstile failed", status);
    return error(
      400,
      "You got flagged as a bot, feel free to go back and try again or send us an email if its broken" +
        JSON.stringify(status),
    );
  }

  if (!ref) {
    console.log("No Referrer", ref);
    return error(400, "You didnt submit it right");
  }

  if (!name) {
    console.warn("No name", name);
    return error(
      400,
      "I need a name, it can be just a first name. Go back to try again",
    );
  }
  if (!word || word.length > 50 || word.split(" ") > 5) {
    console.warn("No word", word);
    return error(
      400,
      "You submitted too much. Please submit 5 or fewer words that clearly state what you want to see. You can submit multiple times. Go back to try again",
    );
  }

  await insertWord(env, name, word);

  return Response.redirect('/join-the-newsletter', 303);
}

async function insertWord(env, name, word) {
  try {
    return env.wordcloudDB
      .prepare("INSERT INTO words (name, word) " + "VALUES (?, ?);")
      .bind(name, word)
      .run();
  } catch (error) {
    console.error("Failed to write to db", error);
  }
}

async function checkToken(secret, remoteip, token) {
  try {
    const response = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          secret: secret,
          response: token,
          remoteip: remoteip,
        }),
      },
    );

    const result = await response.json();
    return result;
  } catch (error) {
    console.error("Turnstile validation error:", error);
    return { success: false, "error-codes": ["internal-error"] };
  }
}

export default { get, post };
