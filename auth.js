import config from "./config.js";
import {
  CapMonsterCloudClientFactory,
  ClientOptions,
  HCaptchaProxylessRequest,
} from "@zennolab_com/capmonstercloud-client";

import ora from "ora";

const login = async (email, password) => {
  const header = {
    Accept: "*/*",
    "Accept-Language": "en-US",
    "Content-Type": "application/json",
    Host: "discord.com",
    "User-Agent": config.web.userAgent,
  };

  const login = ora("Logging in").start();

  const loginReq = await fetch("https://discord.com/api/v9/auth/login", {
    headers: header,
    body: JSON.stringify({
      login: email,
      password: password,
      undelete: false,
      captcha_key: null,
      login_source: null,
      gift_code_sku_id: null,
    }),
    method: "POST",
  });

  const loginReqJson = await loginReq.json();

  if (loginReqJson.token) {
    login.succeed("Logged in successfully");

    return loginReqJson.token;
  } else {
    if (loginReqJson.captcha_key) {
      login.text = "Captcha required to log-in, solving captcha";
      login.color = "yellow";

      const cmcClient = CapMonsterCloudClientFactory.Create(
        new ClientOptions({
          clientKey: config.capmonster.apiKey,
        })
      );

      const Solver = new HCaptchaProxylessRequest({
        websiteURL: "https://discord.com/",
        websiteKey: loginReqJson.captcha_sitekey,
        isInvisible: true,
        minScore: 0.3,
      });

      const captcha = await cmcClient.Solve(Solver);

      if (captcha.error) {
        login.fail("Captcha failed to solve, cancelled: ", captcha.error);
        return false;
      }

      login.text = "Captcha solved, logging in";
      login.color = "green";

      const loginReqCaptcha = await fetch(
        "https://discord.com/api/v9/auth/login",
        {
          headers: header,
          body: JSON.stringify({
            login: email,
            password: password,
            undelete: false,
            captcha_key: captcha.solution.gRecaptchaResponse,
            login_source: null,
            gift_code_sku_id: null,
          }),
          method: "POST",
        }
      );

      const loginReqCaptchaJson = await loginReqCaptcha.json();

      if (loginReqCaptchaJson.token) {
        login.succeed("Logged in successfully, captcha solved");

        return loginReqCaptchaJson.token;
      } else {
        login.fail(
          "Failed to log in, captcha solved but still failed: ",
          loginReqCaptchaJson.errors
        );

        return false;
      }
    }
  }
};

export default login;
