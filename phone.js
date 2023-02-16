import fetch from "node-fetch";
import { stringify } from "querystring";
import config from "./config.js";

// This sends a request to discord to send a code to the phone number
export const phone = async (n, token, fingerprint, captchaKey) => {
  let reqBody = {
    phone: n,
    change_phone_reason: "user_action_required",
  };

  if (captchaKey) {
    reqBody.captcha_key = captchaKey;
  }

  reqBody = JSON.stringify(reqBody);

  const res = await fetch("https://discord.com/api/v9/users/@me/phone", {
    headers: {
      Accept: "*/*",
      "Accept-Language": "en-US",
      "Content-Type": "application/json",
      Host: "discord.com",
      "User-Agent": config.web.userAgent,
      Authorization: token,
      "X-Super-Properties": config.web.superProperties,
    },
    body: reqBody,
    method: "POST",
  });

  const text = await res.text();
  return text === "" ? { message: "Sent" } : JSON.parse(text);
};

// This submits the code to discord
export const phone_code = async (code, token, phone, password) => {
  const body = JSON.stringify({ code: code, phone: phone });

  const res = await fetch(
    `https://discord.com/api/v9/phone-verifications/verify`,
    {
      method: "POST",
      body: body,
      headers: {
        Accept: "*/*",
        "Accept-Language": "en-US",
        "Content-Type": "application/json",
        Host: "discord.com",
        "User-Agent": config.web.userAgent,
        Authorization: token,
        "X-Super-Properties": config.web.superProperties,
      },
    }
  ).catch((e) => {
    console.log("request error on first request", e);
  });

  const json = await res.json().catch((e) => {
    console.log("Parsin json error on first request", e);
  });

  if (json.token) {
    const finalBody = JSON.stringify({
      change_phone_reason: "user_action_required",
      password: password,
      phone_token: json.token,
    });

    const finalRes = await fetch(`https://discord.com/api/v9/users/@me/phone`, {
      method: "POST",
      body: finalBody,
      headers: {
        Accept: "*/*",
        "Accept-Language": "en-US",
        "Content-Type": "application/json",
        Host: "discord.com",
        "User-Agent": config.web.userAgent,
        Authorization: token,
        "X-Super-Properties": config.web.superProperties,
      },
    }).catch((e) => {
      console.log("request error on second req", e);
    });

    const finalJson = await finalRes.text().catch((e) => {
      console.log("parse error on second req", e);
    });

    if (finalJson === "") {
      return true;
    } else {
      return false;
    }
  } else {
    console.log(json);
    console.log("Failed to verify phone number at json token 1.");
    return false;
  }
};


// Get a phone number to send the SMS to
export const getNumber = async () => {
  const res = await fetch(
    "http://smspva.com/priemnik.php?" +
      stringify({
        metod: "get_number",
        country: config.smspva.country,
        service: "opt45",
        apikey: config.smspva.apiKey,
      })
  );

  if (res.ok) {
    const text = await res.text();
    return JSON.parse(text);
  } else {
    throw new Error(`Received status ${res.status} (${res.statusText}).`);
  }
};

// Fetch messages from the phone number
export const getSMS = async (id) => {
  while (true) {
    const res = await fetch(
      "http://smspva.com/priemnik.php?" +
        stringify({
          metod: "get_sms",
          country: config.smspva.country,
          service: "opt45",
          apikey: config.smspva.apiKey,
          id: id,
        })
    );
    const json = await res.json();

    switch (json.response) {
      case "1":
        return json.sms;
      case "2":
        throw "No code";
      case "3":
        throw "Phone number expired!";
    }
  }
};
