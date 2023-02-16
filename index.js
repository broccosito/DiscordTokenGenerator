// Made by @broccosito
// License: MIT

// Modules
import config from "./config.js";
import { faker } from "@faker-js/faker";
import {
  CapMonsterCloudClientFactory,
  ClientOptions,
  HCaptchaProxylessRequest,
} from "@zennolab_com/capmonstercloud-client";

import fs from "fs";
import { getNumber, getSMS, phone, phone_code } from "./phone.js";
import { checkInboxAsync, createInboxAsync } from "tempmail.lol";
import cheerio from "cheerio";

import followRedirects from "follow-redirects";
import querystring from "querystring";
import url from "url";

import ora from "ora";
import login from "./auth.js";

async function follow(url) {
  return new Promise((resolve, reject) => {
    followRedirects.https
      .get(url, (res) => {
        resolve(res.responseUrl);
      })
      .on("error", reject);
  });
}

const getFingerprint = async (url) => {
  const response = await fetch(url).catch((err) => {
    console.log("mierda");
  });

  const json = await response.json().catch((err) => {
    console.log("mierda");
  });

  return json.fingerprint;
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const warmUp = async (token) => {
  const header = {
    Accept: "*/*",
    "Accept-Language": "en-US",
    "Content-Type": "application/json",
    Host: "discord.com",
    "User-Agent": config.web.userAgent,
    authorization: token,
    "X-Super-Properties": config.web.superProperties,
  };

  const warmToken = ora("Warming token").start();

  // Send friend request
  await fetch("https://discord.com/api/v9/users/@me/relationships", {
    headers: header,
    body: JSON.stringify({
      username: config.warmUp.username,
      discriminator: config.warmUp.discriminator,
    }),
    method: "POST",
  });

  warmToken.text = "Friend request sent, opening DM";
  warmToken.color = "green";

  // Open DM
  const openDm = await fetch("https://discord.com/api/v9/users/@me/channels", {
    headers: header,
    body: JSON.stringify({ recipients: [`${config.warmUp.id}`] }),
    method: "POST",
  });

  const openDmJson = await openDm.json();
  const channelId = openDmJson.id;

  warmToken.text = "DM Open, sending captcha request";
  warmToken.color = "green";

  const captchaReq = await fetch(
    `https://discord.com/api/v9/channels/${channelId}/messages`,
    {
      headers: header,
      body: JSON.stringify({
        content:
          "segun los informes gunna fue dedeado hasta la muerte en prision",
        tts: false,
        captcha_key: null,
      }),
      method: "POST",
    }
  );

  const captchaReqJson = await captchaReq.json();
  console.log(captchaReqJson);
  if (!captchaReqJson.captcha_sitekey) {
    return warmToken.succeed(
      "Account successfully warmed up, no captcha required."
    );
  } else {
    warmToken.text = "Captcha request sent, solving captcha";
    warmToken.color = "green";

    const cmcClient = CapMonsterCloudClientFactory.Create(
      new ClientOptions({
        clientKey: config.capmonster.apiKey,
      })
    );

    const Solver = new HCaptchaProxylessRequest({
      websiteURL: "https://discord.com/",
      websiteKey: captchaReqJson.captcha_sitekey,
      isInvisible: true,
      minScore: 0.3,
      data: captchaReqJson.captcha_rqdata,
      userAgent: config.web.userAgent,
    });

    const captcha = await cmcClient.Solve(Solver);

    if (captcha.error) {
      warmToken.fail("Captcha failed to solve, cancelled: ", captcha.error);
      return false;
    }

    warmToken.text = "Captcha solved, sending message";
    warmToken.color = "green";

    const captchaRes = await fetch(
      `https://discord.com/api/v9/channels/${channelId}/messages`,
      {
        headers: header,
        body: JSON.stringify({
          captcha_key: captcha.solution.gRecaptchaResponse,
          content:
            "segun los informes gunna fue dedeado hasta la muerte en prision",
          tts: false,
        }),
        method: "POST",
      }
    );

    warmToken.succeed("Account successfully warmed up.");

    return true;
  }
};

const createAccount = async () => {
  getFingerprint("https://discord.com/api/v9/experiments")
    .then(async (fingerprint) => {
      let email = await createInboxAsync();

      const emailToken = email.token;
      email = email.address;

      const createAccountSpinner = ora("Creating account").start();

      const post = await fetch("https://discord.com/api/v9/auth/register", {
        headers: {
          accept: "*/*",
          "accept-language": "en-US,en;q=0.9",
          "content-type": "application/json",
          "sec-ch-ua":
            '"Not?A_Brand";v="8", "Chromium";v="108", "Google Chrome";v="108"',
          "sec-ch-ua-mobile": "?0",
          "sec-ch-ua-platform": '"Windows"',
          "sec-fetch-dest": "empty",
          "sec-fetch-mode": "cors",
          "sec-fetch-site": "same-origin",
          "x-debug-options": "bugReporterEnabled",
          "x-discord-locale": "en-US",
          "x-fingerprint": fingerprint,
          "x-super-properties": config.web.superProperties,
          cookie:
            "__dcfduid=0ada5b408f8811eda1c2af3b5318ebad; __sdcfduid=0ada5b418f8811eda1c2af3b5318ebad717699db4fe9b932166e8de1e0a0d32d4b69787ff8c9c9e8f8264ae693c086d8; __cfruid=090eb49a0501a9f3ee48156c0602a9748b86db8b-1673204997; locale=en-US",
          Referer: "https://discord.com/register",
          "Referrer-Policy": "strict-origin-when-cross-origin",
        },
        body: JSON.stringify({
          fingerprint: fingerprint,
          email: email,
          username: "Cartel de Sinaloa",
          password: faker.internet.password(),
          invite: config.invite || null,
          consent: true,
          date_of_birth: "2001-09-11",
          gift_code_sku_id: null,
          captcha_key: null,
          promotional_email_opt_in: false,
        }),
        method: "POST",
      }).catch((err) => {
        createAccountSpinner.fail(
          "Something went wrong with account creation: ",
          err
        );
      });

      const json = await post.json().catch((err) => {
        createAccountSpinner.fail(
          "Something went wrong with account creation: ",
          err
        );
      });

      if (json.errors) {
        createAccountSpinner.fail("Discord API Error: " + json.message);

        createAccount();
      } else {
        if (json.captcha_key) {
          createAccountSpinner.text = "Solving account creation hCaptcha";
          createAccountSpinner.color = "yellow";

          const cmcClient = CapMonsterCloudClientFactory.Create(
            new ClientOptions({
              clientKey: config.capmonster.apiKey,
            })
          );

          const Solver = new HCaptchaProxylessRequest({
            websiteURL: "https://discord.com/",
            websiteKey: json.captcha_sitekey,
            isInvisible: true,
            minScore: 0.3,
          });

          const captcha = await cmcClient.Solve(Solver);

          if (captcha.error) {
            return createAccountSpinner.fail(
              "Capmonster Error: " + captcha.error
            );
          }

          createAccountSpinner.text =
            "Solved hCaptcha, retrying account creation";
          createAccountSpinner.color = "cyan";

          const accountEmail = email;
          const accountUsername = faker.internet.userName();
          const accountPassword = "Carteldesinaloa23$";

          const create = await fetch(
            "https://discord.com/api/v9/auth/register",
            {
              headers: {
                accept: "*/*",
                "accept-language": "en-US,en;q=0.9",
                "content-type": "application/json",
                "sec-ch-ua":
                  '"Not?A_Brand";v="8", "Chromium";v="108", "Google Chrome";v="108"',
                "sec-ch-ua-mobile": "?0",
                "sec-ch-ua-platform": '"Windows"',
                "sec-fetch-dest": "empty",
                "sec-fetch-mode": "cors",
                "sec-fetch-site": "same-origin",
                "x-debug-options": "bugReporterEnabled",
                "x-discord-locale": "en-US",
                "x-fingerprint": fingerprint,
                "x-super-properties": config.web.superProperties,
                cookie:
                  "__dcfduid=0ada5b408f8811eda1c2af3b5318ebad; __sdcfduid=0ada5b418f8811eda1c2af3b5318ebad717699db4fe9b932166e8de1e0a0d32d4b69787ff8c9c9e8f8264ae693c086d8; __cfruid=090eb49a0501a9f3ee48156c0602a9748b86db8b-1673204997; locale=en-US",
                Referer: "https://discord.com/register",
                "Referrer-Policy": "strict-origin-when-cross-origin",
              },
              body: JSON.stringify({
                fingerprint: fingerprint,
                email: accountEmail,
                username: accountUsername,
                password: accountPassword,
                invite: config.invite || null,
                consent: true,
                date_of_birth: "2001-01-01",
                gift_code_sku_id: null,
                captcha_key: captcha.solution.gRecaptchaResponse,
                promotional_email_opt_in: false,
              }),
              method: "POST",
            }
          );

          const account = await create.json();

          if (account.token) {
            createAccountSpinner.text =
              "Account created, waiting for verification e-mail";
            createAccountSpinner.color = "green";

            await sleep(15 * 1000);

            const newEmails = await checkInboxAsync(emailToken);
            if (newEmails.length == 0) {
              return createAccountSpinner.fail(
                "No e-mail received after 15 seconds, cancelled"
              );
            }

            createAccountSpinner.text = "E-mail received, verifying account";
            createAccountSpinner.color = "yellow";

            const discordEmail = newEmails[0];
            const $ = cheerio.load(discordEmail.html);

            const linkObjects = $("a");
            const links = [];

            linkObjects.each((index, element) => {
              links.push({
                text: $(element).text(),
                href: $(element).attr("href"),
              });
            });

            let verificationLink = links.find((link) => {
              return link.text.includes("Verify");
            });

            if (!verificationLink) {
              return createAccountSpinner.fail(
                "No verification link found in e-mail, cancelled"
              );
            }

            verificationLink = verificationLink.href;

            const final = await follow(verificationLink);

            const fragments = querystring.parse(
              url.parse(final).hash.replace("#", "")
            );
            const verificationToken = fragments.token;

            const firstVerify = await fetch(
              "https://discord.com/api/v9/auth/verify",
              {
                headers: {
                  Accept: "*/*",
                  "Accept-Language": "en-US",
                  "Content-Type": "application/json",
                  Host: "discord.com",
                  "User-Agent": config.web.userAgent,
                  Authorization: account.token,
                  "X-Super-Properties": config.web.superProperties,
                },
                body: JSON.stringify({
                  token: verificationToken,
                  captcha_key: null,
                }),
                method: "POST",
              }
            );

            const firstVerifyJson = await firstVerify.json();

            if (firstVerifyJson.captcha_key) {
              createAccountSpinner.text =
                "Solving account e-mail verification hCaptcha";
              createAccountSpinner.color = "yellow";

              const cmcClientVerify = CapMonsterCloudClientFactory.Create(
                new ClientOptions({
                  clientKey: config.capmonster.apiKey,
                })
              );

              const SolverVerify = new HCaptchaProxylessRequest({
                websiteURL: "https://discord.com/",
                websiteKey: firstVerifyJson.captcha_sitekey,
                isInvisible: true,
                minScore: 0.3,
              });

              const captchaVerify = await cmcClientVerify.Solve(SolverVerify);

              if (captchaVerify.error) {
                return createAccountSpinner.fail(
                  "Capmonster Error: " + captcha.error
                );
              }

              createAccountSpinner.text =
                "Solved hCaptcha, retrying e-mail verification";
              createAccountSpinner.color = "cyan";

              const secondVerify = await fetch(
                "https://discord.com/api/v9/auth/verify",
                {
                  headers: {
                    Accept: "*/*",
                    "Accept-Language": "en-US",
                    "Content-Type": "application/json",
                    Host: "discord.com",
                    "User-Agent": config.web.userAgent,
                    Authorization: account.token,
                    "X-Super-Properties": config.web.superProperties,
                  },
                  body: JSON.stringify({
                    token: verificationToken,
                    captcha_key: captchaVerify.solution.gRecaptchaResponse,
                  }),
                  method: "POST",
                }
              );

              const secondVerifyJson = await secondVerify.json();

              if (secondVerifyJson.message) {
                return createAccountSpinner.fail(
                  "E-mail verification error:  " + captcha.error
                );
              }

              if (secondVerifyJson.user_id) {
                createAccountSpinner.text = "Verified account e-mail!";
                createAccountSpinner.color = "green";
              }
            }

            const number = await getNumber();

            if (number.response != "1") {
              return createAccountSpinner.fail(
                "No numbers available, cancelled"
              );
            }

            const setNumber = await phone(
              number.CountryCode + number.number,
              account.token,
              fingerprint
            );

            if (setNumber.captcha_key) {
              createAccountSpinner.text = "Solving phone verification hCaptcha";
              createAccountSpinner.color = "yellow";

              const cmcClientPhone = CapMonsterCloudClientFactory.Create(
                new ClientOptions({
                  clientKey: config.capmonster.apiKey,
                })
              );

              const SolverPhone = new HCaptchaProxylessRequest({
                websiteURL: "https://discord.com/",
                websiteKey: setNumber.captcha_sitekey,
                isInvisible: true,
                minScore: 0.3,
              });

              const captchaPhone = await cmcClientPhone.Solve(SolverPhone);

              if (captchaPhone.error) {
                return createAccountSpinner.fail(
                  "Capmonster Error: " + captchaPhone.error
                );
              }

              const setNumberKey = await phone(
                `${number.CountryCode}${number.number}`,
                account.token,
                fingerprint,
                captchaPhone.solution.gRecaptchaResponse
              );

              if (setNumberKey.message !== "Sent") {
                return createAccountSpinner.fail(
                  "Code not sent, phone may have been blocked by Discord, cancelled"
                );
              } else {
                createAccountSpinner.text = "Phone verification code sent";
                createAccountSpinner.color = "green";

                const workCode = async () => {
                  const code = await getSMS(number.id).catch((err) => {
                    if (err === "No code") {
                      return false;
                    }
                  });

                  if (code) {
                    createAccountSpinner.text =
                      "Received phone verification code: " + code;
                    createAccountSpinner.color = "green";

                    await phone_code(
                      code,
                      account.token,
                      `${number.CountryCode}${number.number}`,
                      accountPassword
                    );

                    return true;
                  }
                };

                async function runUntilTrue() {
                  const run = await workCode();
                  if (run) {
                    clearInterval(interval);

                    // Auth in case Discord invalidated the token right away
                    let accountNew = await login(accountEmail, accountPassword);
                    console.log(accountNew);
                    if (!accountNew) {
                      accountNew = account.token;
                    }

                    await fs.appendFileSync(
                      "tokens.txt",
                      `${accountNew}:${accountEmail}:${accountPassword}\n`
                    );

                    createAccountSpinner.succeed(
                      "Account created! Token has been added to tokens.txt"
                    );

                    if (config.warmUp.username !== "") {
                      await warmUp(`${accountNew}`).catch((err) => {
                        console.error("Token warmup failed: ", err);
                      });
                    }

                    return true;
                  }
                }

                workCode();
                const interval = setInterval(runUntilTrue, 10000);
              }
            }
          } else {
            throw new Error(
              "Discord API Error: " + account.message + " " + account.code
            );
          }
        } else {
          if (json.retry_after) {
            createAccountSpinner.text =
              "Rate limited, waiting " + json.retry_after + " Seconds";
            const inMs = json.retry_after * 1000;
            await new Promise((r) => setTimeout(r, inMs));
            createAccountSpinner.info("Retrying account creation");

            return createAccount();
          }
        }
      }
    })
    .catch((err) => {
      console.error("Something went wrong while fetching fingerprint: ", err);
    });
};

createAccount();
setInterval(createAccount, 120 * 1000);
