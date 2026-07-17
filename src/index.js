import { AutoRouter, error, withContent, withCookies } from "itty-router";
import wordcloud from "./wordcloud";
const router = AutoRouter({
  catch: error,
});

// form submission
router.get("/wordcloud", withCookies, wordcloud.get);
router.post("/wordcloud", withCookies, withContent, wordcloud.post);

export default router;
