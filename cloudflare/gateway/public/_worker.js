// A short public Pages address; all data and scheduled work remain in one Worker.
export default {
  async fetch(request, env) {
    return env.BIOAI_SITE.fetch(request);
  },
};
