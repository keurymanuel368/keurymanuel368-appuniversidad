var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// node_modules/hono/dist/request/constants.js
var GET_MATCH_RESULT = /* @__PURE__ */ Symbol();

// node_modules/hono/dist/utils/buffer.js
var bufferToFormData = /* @__PURE__ */ __name((arrayBuffer, contentType) => {
  return new Response(arrayBuffer, { headers: { "Content-Type": contentType.replace(/^[^;]+/, (mediaType) => mediaType.toLowerCase()) } }).formData();
}, "bufferToFormData");

// node_modules/hono/dist/utils/body.js
var MAX_NESTED_OBJECTS = 1e4;
var isRawRequest = /* @__PURE__ */ __name((request) => "headers" in request, "isRawRequest");
var parseBody = /* @__PURE__ */ __name(async (request, options = /* @__PURE__ */ Object.create(null)) => {
  const { all = false, dot = false } = options;
  const mediaType = (isRawRequest(request) ? request.headers : request.raw.headers).get("Content-Type")?.split(";")[0].trim().toLowerCase();
  if (mediaType === "multipart/form-data" || mediaType === "application/x-www-form-urlencoded") return parseFormData(request, {
    all,
    dot
  });
  return {};
}, "parseBody");
async function parseFormData(request, options) {
  if (!isRawRequest(request) && request.bodyCache.formData) return convertFormDataToBodyData(await request.bodyCache.formData, options);
  const headers = isRawRequest(request) ? request.headers : request.raw.headers;
  const arrayBuffer = await request.arrayBuffer();
  const formDataPromise = bufferToFormData(arrayBuffer, headers.get("Content-Type") || "");
  if (!isRawRequest(request)) request.bodyCache.formData = formDataPromise;
  const formData = await formDataPromise;
  if (formData) return convertFormDataToBodyData(formData, options);
  return {};
}
__name(parseFormData, "parseFormData");
function convertFormDataToBodyData(formData, options) {
  const form = /* @__PURE__ */ Object.create(null);
  const nestingState = { count: 0 };
  formData.forEach((value, key) => {
    if (!(options.all || key.endsWith("[]"))) form[key] = value;
    else handleParsingAllValues(form, key, value);
  });
  if (options.dot) Object.entries(form).forEach(([key, value]) => {
    if (key.includes(".")) {
      handleParsingNestedValues(form, key, value, nestingState);
      delete form[key];
    }
  });
  return form;
}
__name(convertFormDataToBodyData, "convertFormDataToBodyData");
var handleParsingAllValues = /* @__PURE__ */ __name((form, key, value) => {
  if (form[key] !== void 0) {
    if (Array.isArray(form[key])) form[key].push(value);
    else form[key] = [form[key], value];
  } else if (!key.endsWith("[]")) form[key] = value;
  else form[key] = [value];
}, "handleParsingAllValues");
var handleParsingNestedValues = /* @__PURE__ */ __name((form, key, value, state) => {
  if (/(?:^|\.)__proto__\./.test(key)) return;
  let nestedForm = form;
  const keys = key.split(".", 34);
  if (keys.length > 33) throwNestingLimitExceeded();
  keys.forEach((key2, index) => {
    if (index === keys.length - 1) nestedForm[key2] = value;
    else {
      if (!nestedForm[key2] || typeof nestedForm[key2] !== "object" || Array.isArray(nestedForm[key2]) || nestedForm[key2] instanceof File) {
        if (state.count++ >= MAX_NESTED_OBJECTS) throwNestingLimitExceeded();
        nestedForm[key2] = /* @__PURE__ */ Object.create(null);
      }
      nestedForm = nestedForm[key2];
    }
  });
}, "handleParsingNestedValues");
var throwNestingLimitExceeded = /* @__PURE__ */ __name(() => {
  throw new Error("Nesting limit exceeded");
}, "throwNestingLimitExceeded");

// node_modules/hono/dist/utils/url.js
var splitPath = /* @__PURE__ */ __name((path) => {
  const paths = path.split("/");
  if (paths[0] === "") paths.shift();
  return paths;
}, "splitPath");
var splitRoutingPath = /* @__PURE__ */ __name((routePath) => {
  const { groups, path } = extractGroupsFromPath(routePath);
  const paths = splitPath(path);
  return replaceGroupMarks(paths, groups);
}, "splitRoutingPath");
var extractGroupsFromPath = /* @__PURE__ */ __name((path) => {
  const groups = [];
  path = path.replace(/\{[^}]+\}/g, (match2, index) => {
    const mark = `@${index}`;
    groups.push([mark, match2]);
    return mark;
  });
  return {
    groups,
    path
  };
}, "extractGroupsFromPath");
var replaceGroupMarks = /* @__PURE__ */ __name((paths, groups) => {
  for (let i = groups.length - 1; i >= 0; i--) {
    const [mark] = groups[i];
    for (let j = paths.length - 1; j >= 0; j--) if (paths[j].includes(mark)) {
      paths[j] = paths[j].replace(mark, groups[i][1]);
      break;
    }
  }
  return paths;
}, "replaceGroupMarks");
var patternCache = {};
var getPattern = /* @__PURE__ */ __name((label, next) => {
  if (label === "*") return "*";
  const match2 = label.match(/^\:([^\{\}]+)(?:\{(.+)\})?$/);
  if (match2) {
    const cacheKey = `${label}#${next}`;
    if (!patternCache[cacheKey]) {
      if (match2[2]) patternCache[cacheKey] = next && next[0] !== ":" && next[0] !== "*" ? [
        cacheKey,
        match2[1],
        new RegExp(`^${match2[2]}(?=/${next})`)
      ] : [
        label,
        match2[1],
        new RegExp(`^${match2[2]}$`)
      ];
      else patternCache[cacheKey] = [
        label,
        match2[1],
        true
      ];
    }
    return patternCache[cacheKey];
  }
  return null;
}, "getPattern");
var tryDecode = /* @__PURE__ */ __name((str, decoder) => {
  try {
    return decoder(str);
  } catch {
    return str.replace(/(?:%[0-9A-Fa-f]{2})+/g, (match2) => {
      try {
        return decoder(match2);
      } catch {
        return match2;
      }
    });
  }
}, "tryDecode");
var tryDecodeURI = /* @__PURE__ */ __name((str) => tryDecode(str, decodeURI), "tryDecodeURI");
var getPath = /* @__PURE__ */ __name((request) => {
  const url = request.url;
  const start = url.indexOf("/", url.indexOf(":") + 4);
  let i = start;
  for (; i < url.length; i++) {
    const charCode = url.charCodeAt(i);
    if (charCode === 37) {
      const queryIndex = url.indexOf("?", i);
      const hashIndex = url.indexOf("#", i);
      const end = queryIndex === -1 ? hashIndex === -1 ? void 0 : hashIndex : hashIndex === -1 ? queryIndex : Math.min(queryIndex, hashIndex);
      const path = url.slice(start, end);
      return tryDecodeURI(path.includes("%25") ? path.replace(/%25/g, "%2525") : path);
    } else if (charCode === 63 || charCode === 35) break;
  }
  return url.slice(start, i);
}, "getPath");
var getPathNoStrict = /* @__PURE__ */ __name((request) => {
  const result = getPath(request);
  return result.length > 1 && result.at(-1) === "/" ? result.slice(0, -1) : result;
}, "getPathNoStrict");
var mergePath = /* @__PURE__ */ __name((base, sub, ...rest) => {
  if (rest.length) sub = mergePath(sub, ...rest);
  return `${base?.[0] === "/" ? "" : "/"}${base}${sub === "/" ? "" : `${base?.at(-1) === "/" ? "" : "/"}${sub?.[0] === "/" ? sub.slice(1) : sub}`}`;
}, "mergePath");
var checkOptionalParameter = /* @__PURE__ */ __name((path) => {
  if (path.charCodeAt(path.length - 1) !== 63 || !path.includes(":")) return null;
  const segments = path.split("/");
  const results = [];
  let basePath = "";
  segments.forEach((segment) => {
    if (segment !== "" && !/\:/.test(segment)) basePath += "/" + segment;
    else if (/\:/.test(segment)) {
      if (segment.charCodeAt(segment.length - 1) === 63) {
        if (results.length === 0 && basePath === "") results.push("/");
        else results.push(basePath);
        const optionalSegment = segment.slice(0, -1);
        basePath += "/" + optionalSegment;
        results.push(basePath);
      } else basePath += "/" + segment;
    }
  });
  return results.filter((v, i, a) => a.indexOf(v) === i);
}, "checkOptionalParameter");
var tryDecodeURIComponent = /* @__PURE__ */ __name((str) => str.indexOf("%") !== -1 ? tryDecode(str, decodeURIComponent_) : str, "tryDecodeURIComponent");
var _decodeURI = /* @__PURE__ */ __name((value) => {
  if (value.indexOf("+") !== -1) value = value.replace(/\+/g, " ");
  return tryDecodeURIComponent(value);
}, "_decodeURI");
var _getQueryParam = /* @__PURE__ */ __name((url, key, multiple) => {
  const hashIndex = url.indexOf("#", 8);
  if (hashIndex !== -1) url = url.slice(0, hashIndex);
  let encoded;
  if (!multiple && key && key.indexOf("%") === -1 && key.indexOf("+") === -1) {
    let keyIndex2 = url.indexOf("?", 8);
    if (keyIndex2 === -1) return;
    if (!url.startsWith(key, keyIndex2 + 1)) keyIndex2 = url.indexOf(`&${key}`, keyIndex2 + 1);
    while (keyIndex2 !== -1) {
      const trailingKeyCode = url.charCodeAt(keyIndex2 + key.length + 1);
      if (trailingKeyCode === 61) {
        const valueIndex = keyIndex2 + key.length + 2;
        const endIndex = url.indexOf("&", valueIndex);
        return _decodeURI(url.slice(valueIndex, endIndex === -1 ? void 0 : endIndex));
      } else if (trailingKeyCode == 38 || isNaN(trailingKeyCode)) return "";
      keyIndex2 = url.indexOf(`&${key}`, keyIndex2 + 1);
    }
    encoded = /[%+]/.test(url);
    if (!encoded) return;
  }
  const results = /* @__PURE__ */ Object.create(null);
  encoded ??= /[%+]/.test(url);
  let keyIndex = url.indexOf("?", 8);
  while (keyIndex !== -1) {
    const nextKeyIndex = url.indexOf("&", keyIndex + 1);
    let valueIndex = url.indexOf("=", keyIndex);
    if (valueIndex > nextKeyIndex && nextKeyIndex !== -1) valueIndex = -1;
    let name = url.slice(keyIndex + 1, valueIndex === -1 ? nextKeyIndex === -1 ? void 0 : nextKeyIndex : valueIndex);
    if (encoded) name = _decodeURI(name);
    keyIndex = nextKeyIndex;
    if (name === "") continue;
    let value;
    if (valueIndex === -1) value = "";
    else {
      value = url.slice(valueIndex + 1, nextKeyIndex === -1 ? void 0 : nextKeyIndex);
      if (encoded) value = _decodeURI(value);
    }
    if (multiple) {
      if (!(results[name] && Array.isArray(results[name]))) results[name] = [];
      results[name].push(value);
    } else results[name] ??= value;
  }
  return key ? results[key] : results;
}, "_getQueryParam");
var getQueryParam = _getQueryParam;
var getQueryParams = /* @__PURE__ */ __name((url, key) => {
  return _getQueryParam(url, key, true);
}, "getQueryParams");
var decodeURIComponent_ = decodeURIComponent;

// node_modules/hono/dist/request.js
var HonoRequest = class {
  static {
    __name(this, "HonoRequest");
  }
  /**
  * `.raw` can get the raw Request object.
  *
  * @see {@link https://hono.dev/docs/api/request#raw}
  *
  * @example
  * ```ts
  * // For Cloudflare Workers
  * app.post('/', async (c) => {
  *   const metadata = c.req.raw.cf?.hostMetadata?
  *   ...
  * })
  * ```
  */
  raw;
  #validatedData;
  #matchResult;
  routeIndex = 0;
  /**
  * `.path` can get the pathname of the request.
  *
  * @see {@link https://hono.dev/docs/api/request#path}
  *
  * @example
  * ```ts
  * app.get('/about/me', (c) => {
  *   const pathname = c.req.path // `/about/me`
  * })
  * ```
  */
  path;
  bodyCache = {};
  constructor(request, path = "/", matchResult = [[]]) {
    this.raw = request;
    this.path = path;
    this.#matchResult = matchResult;
  }
  param(key) {
    return key ? this.#getDecodedParam(key) : this.#getAllDecodedParams();
  }
  #getDecodedParam(key) {
    const paramKey = this.#matchResult[0][this.routeIndex]?.[1][key];
    const param = this.#getParamValue(paramKey);
    return param && tryDecodeURIComponent(param);
  }
  #getAllDecodedParams() {
    const decoded = {};
    const keys = Object.keys(this.#matchResult[0][this.routeIndex]?.[1] ?? {});
    for (const key of keys) {
      const value = this.#getParamValue(this.#matchResult[0][this.routeIndex][1][key]);
      if (value !== void 0) decoded[key] = tryDecodeURIComponent(value);
    }
    return decoded;
  }
  #getParamValue(paramKey) {
    return this.#matchResult[1] ? this.#matchResult[1][paramKey] : paramKey;
  }
  query(key) {
    return getQueryParam(this.url, key);
  }
  queries(key) {
    return getQueryParams(this.url, key);
  }
  header(name) {
    if (name) return this.raw.headers.get(name) ?? void 0;
    const headerData = /* @__PURE__ */ Object.create(null);
    this.raw.headers.forEach((value, key) => {
      headerData[key] = value;
    });
    return headerData;
  }
  async parseBody(options) {
    return parseBody(this, options);
  }
  #cachedBody = /* @__PURE__ */ __name((key) => {
    const { bodyCache, raw: raw2 } = this;
    const cachedBody = bodyCache[key];
    if (cachedBody) return cachedBody;
    for (const anyCachedKey in bodyCache) return bodyCache[anyCachedKey].then((body) => {
      if (anyCachedKey === "json") body = JSON.stringify(body);
      const contentType = anyCachedKey === "formData" ? void 0 : raw2.headers.get("content-type");
      return new Response(body, { headers: contentType ? { "Content-Type": contentType } : void 0 })[key]();
    });
    return bodyCache[key] = raw2[key]();
  }, "#cachedBody");
  /**
  * `.json()` can parse Request body of type `application/json`
  *
  * @see {@link https://hono.dev/docs/api/request#json}
  *
  * @example
  * ```ts
  * app.post('/entry', async (c) => {
  *   const body = await c.req.json()
  * })
  * ```
  */
  json() {
    return this.#cachedBody("text").then((text) => JSON.parse(text));
  }
  /**
  * `.text()` can parse Request body of type `text/plain`
  *
  * @see {@link https://hono.dev/docs/api/request#text}
  *
  * @example
  * ```ts
  * app.post('/entry', async (c) => {
  *   const body = await c.req.text()
  * })
  * ```
  */
  text() {
    return this.#cachedBody("text");
  }
  /**
  * `.arrayBuffer()` parse Request body as an `ArrayBuffer`
  *
  * @see {@link https://hono.dev/docs/api/request#arraybuffer}
  *
  * @example
  * ```ts
  * app.post('/entry', async (c) => {
  *   const body = await c.req.arrayBuffer()
  * })
  * ```
  */
  arrayBuffer() {
    return this.#cachedBody("arrayBuffer");
  }
  /**
  * `.bytes()` parses the request body as a `Uint8Array`.
  *
  * @see {@link https://hono.dev/docs/api/request#bytes}
  *
  * @example
  * ```ts
  * app.post('/entry', async (c) => {
  *   const body = await c.req.bytes()
  * })
  * ```
  */
  bytes() {
    return this.#cachedBody("arrayBuffer").then((buffer) => new Uint8Array(buffer));
  }
  /**
  * Parses the request body as a `Blob`.
  * @example
  * ```ts
  * app.post('/entry', async (c) => {
  *   const body = await c.req.blob();
  * });
  * ```
  * @see https://hono.dev/docs/api/request#blob
  */
  blob() {
    return this.#cachedBody("blob");
  }
  /**
  * Parses the request body as `FormData`.
  * @example
  * ```ts
  * app.post('/entry', async (c) => {
  *   const body = await c.req.formData();
  * });
  * ```
  * @see https://hono.dev/docs/api/request#formdata
  */
  formData() {
    return this.#cachedBody("formData");
  }
  /**
  * Adds validated data to the request.
  *
  * @param target - The target of the validation.
  * @param data - The validated data to add.
  */
  addValidatedData(target, data) {
    (this.#validatedData ??= {})[target] = data;
  }
  valid(target) {
    return this.#validatedData?.[target];
  }
  /**
  * `.url()` can get the request url strings.
  *
  * @see {@link https://hono.dev/docs/api/request#url}
  *
  * @example
  * ```ts
  * app.get('/about/me', (c) => {
  *   const url = c.req.url // `http://localhost:8787/about/me`
  *   ...
  * })
  * ```
  */
  get url() {
    return this.raw.url;
  }
  /**
  * `.method()` can get the method name of the request.
  *
  * @see {@link https://hono.dev/docs/api/request#method}
  *
  * @example
  * ```ts
  * app.get('/about/me', (c) => {
  *   const method = c.req.method // `GET`
  * })
  * ```
  */
  get method() {
    return this.raw.method;
  }
  get [GET_MATCH_RESULT]() {
    return this.#matchResult;
  }
  /**
  * `.matchedRoutes()` can return a matched route in the handler
  *
  * @deprecated
  *
  * Use matchedRoutes helper defined in "hono/route" instead.
  *
  * @see {@link https://hono.dev/docs/api/request#matchedroutes}
  *
  * @example
  * ```ts
  * app.use('*', async function logger(c, next) {
  *   await next()
  *   c.req.matchedRoutes.forEach(({ handler, method, path }, i) => {
  *     const name = handler.name || (handler.length < 2 ? '[handler]' : '[middleware]')
  *     console.log(
  *       method,
  *       ' ',
  *       path,
  *       ' '.repeat(Math.max(10 - path.length, 0)),
  *       name,
  *       i === c.req.routeIndex ? '<- respond from here' : ''
  *     )
  *   })
  * })
  * ```
  */
  get matchedRoutes() {
    return this.#matchResult[0].map(([[, route]]) => route);
  }
  /**
  * `routePath()` can retrieve the path registered within the handler
  *
  * @deprecated
  *
  * Use routePath helper defined in "hono/route" instead.
  *
  * @see {@link https://hono.dev/docs/api/request#routepath}
  *
  * @example
  * ```ts
  * app.get('/posts/:id', (c) => {
  *   return c.json({ path: c.req.routePath })
  * })
  * ```
  */
  get routePath() {
    return this.#matchResult[0].map(([[, route]]) => route)[this.routeIndex].path;
  }
};

// node_modules/hono/dist/utils/html.js
var HtmlEscapedCallbackPhase = {
  Stringify: 1,
  BeforeStream: 2,
  Stream: 3
};
var raw = /* @__PURE__ */ __name((value, callbacks) => {
  const escapedString = new String(value);
  escapedString.isEscaped = true;
  escapedString.callbacks = callbacks;
  return escapedString;
}, "raw");
var resolveCallback = /* @__PURE__ */ __name(async (str, phase, preserveCallbacks, context, buffer) => {
  if (typeof str === "object" && !(str instanceof String)) {
    if (!(str instanceof Promise)) str = str.toString();
    if (str instanceof Promise) str = await str;
  }
  const callbacks = str.callbacks;
  if (!callbacks?.length) return Promise.resolve(str);
  if (buffer) buffer[0] += str;
  else buffer = [str];
  const resStr = Promise.all(callbacks.map((c) => c({
    phase,
    buffer,
    context
  }))).then((res) => Promise.all(res.filter(Boolean).map((str2) => resolveCallback(str2, phase, false, context, buffer))).then(() => buffer[0]));
  if (preserveCallbacks) return raw(await resStr, callbacks);
  else return resStr;
}, "resolveCallback");

// node_modules/hono/dist/context.js
var TEXT_PLAIN = "text/plain; charset=UTF-8";
var setDefaultContentType = /* @__PURE__ */ __name((contentType, headers) => {
  return {
    "Content-Type": contentType,
    ...headers
  };
}, "setDefaultContentType");
var createResponseInstance = /* @__PURE__ */ __name((body, init) => new Response(body, init), "createResponseInstance");
var Context = class {
  static {
    __name(this, "Context");
  }
  #rawRequest;
  #req;
  /**
  * `.env` can get bindings (environment variables, secrets, KV namespaces, D1 database, R2 bucket etc.) in Cloudflare Workers.
  *
  * @see {@link https://hono.dev/docs/api/context#env}
  *
  * @example
  * ```ts
  * // Environment object for Cloudflare Workers
  * app.get('*', async c => {
  *   const counter = c.env.COUNTER
  * })
  * ```
  */
  env = {};
  #var;
  finalized = false;
  /**
  * `.error` can get the error object from the middleware if the Handler throws an error.
  *
  * @see {@link https://hono.dev/docs/api/context#error}
  *
  * @example
  * ```ts
  * app.use('*', async (c, next) => {
  *   await next()
  *   if (c.error) {
  *     // do something...
  *   }
  * })
  * ```
  */
  error;
  #status;
  #executionCtx;
  #res;
  #layout;
  #renderer;
  #notFoundHandler;
  #preparedHeaders;
  #matchResult;
  #path;
  /**
  * Creates an instance of the Context class.
  *
  * @param req - The Request object.
  * @param options - Optional configuration options for the context.
  */
  constructor(req, options) {
    this.#rawRequest = req;
    if (options) {
      this.#executionCtx = options.executionCtx;
      this.env = options.env;
      this.#notFoundHandler = options.notFoundHandler;
      this.#path = options.path;
      this.#matchResult = options.matchResult;
    }
  }
  /**
  * `.req` is the instance of {@link HonoRequest}.
  */
  get req() {
    this.#req ??= new HonoRequest(this.#rawRequest, this.#path, this.#matchResult);
    return this.#req;
  }
  /**
  * @see {@link https://hono.dev/docs/api/context#event}
  * The FetchEvent associated with the current request.
  *
  * @throws Will throw an error if the context does not have a FetchEvent.
  */
  get event() {
    if (this.#executionCtx && "respondWith" in this.#executionCtx) return this.#executionCtx;
    else throw Error("This context has no FetchEvent");
  }
  /**
  * @see {@link https://hono.dev/docs/api/context#executionctx}
  * The ExecutionContext associated with the current request.
  *
  * @throws Will throw an error if the context does not have an ExecutionContext.
  */
  get executionCtx() {
    if (this.#executionCtx) return this.#executionCtx;
    else throw Error("This context has no ExecutionContext");
  }
  /**
  * @see {@link https://hono.dev/docs/api/context#res}
  * The Response object for the current request.
  */
  get res() {
    return this.#res ||= createResponseInstance(null, { headers: this.#preparedHeaders ??= new Headers() });
  }
  /**
  * Sets the Response object for the current request.
  *
  * @param _res - The Response object to set.
  */
  set res(_res) {
    if (this.#res && _res) {
      _res = createResponseInstance(_res.body, _res);
      for (const [k, v] of this.#res.headers.entries()) {
        if (k === "content-type") continue;
        if (k === "set-cookie") {
          const cookies = this.#res.headers.getSetCookie();
          _res.headers.delete("set-cookie");
          for (const cookie of cookies) _res.headers.append("set-cookie", cookie);
        } else _res.headers.set(k, v);
      }
    }
    this.#res = _res;
    this.finalized = true;
  }
  /**
  * `.render()` can create a response within a layout.
  *
  * @see {@link https://hono.dev/docs/api/context#render-setrenderer}
  *
  * @example
  * ```ts
  * app.get('/', (c) => {
  *   return c.render('Hello!')
  * })
  * ```
  */
  render = /* @__PURE__ */ __name((...args) => {
    this.#renderer ??= (content) => this.html(content);
    return this.#renderer(...args);
  }, "render");
  /**
  * Sets the layout for the response.
  *
  * @param layout - The layout to set.
  * @returns The layout function.
  */
  setLayout = /* @__PURE__ */ __name((layout) => this.#layout = layout, "setLayout");
  /**
  * Gets the current layout for the response.
  *
  * @returns The current layout function.
  */
  getLayout = /* @__PURE__ */ __name(() => this.#layout, "getLayout");
  /**
  * `.setRenderer()` can set the layout in the custom middleware.
  *
  * @see {@link https://hono.dev/docs/api/context#render-setrenderer}
  *
  * @example
  * ```tsx
  * app.use('*', async (c, next) => {
  *   c.setRenderer((content) => {
  *     return c.html(
  *       <html>
  *         <body>
  *           <p>{content}</p>
  *         </body>
  *       </html>
  *     )
  *   })
  *   await next()
  * })
  * ```
  */
  setRenderer = /* @__PURE__ */ __name((renderer) => {
    this.#renderer = renderer;
  }, "setRenderer");
  /**
  * `.header()` can set headers.
  *
  * @see {@link https://hono.dev/docs/api/context#header}
  *
  * @example
  * ```ts
  * app.get('/welcome', (c) => {
  *   // Set headers
  *   c.header('X-Message', 'Hello!')
  *   c.header('Content-Type', 'text/plain')
  *
  *   // Append multiple headers using the append option (e.g. Vary)
  *   c.header('Vary', 'Accept-Encoding', { append: true })
  *   c.header('Vary', 'User-Agent', { append: true })
  *
  *   return c.body('Thank you for coming')
  * })
  * ```
  */
  header = /* @__PURE__ */ __name((name, value, options) => {
    if (this.finalized) this.#res = createResponseInstance(this.#res.body, this.#res);
    const headers = this.#res ? this.#res.headers : this.#preparedHeaders ??= new Headers();
    if (value === void 0) headers.delete(name);
    else if (options?.append) headers.append(name, value);
    else headers.set(name, value);
  }, "header");
  status = /* @__PURE__ */ __name((status) => {
    this.#status = status;
  }, "status");
  /**
  * `.set()` can set the value specified by the key.
  *
  * @see {@link https://hono.dev/docs/api/context#set-get}
  *
  * @example
  * ```ts
  * app.use('*', async (c, next) => {
  *   c.set('message', 'Hono is hot!!')
  *   await next()
  * })
  * ```
  */
  set = /* @__PURE__ */ __name((key, value) => {
    this.#var ??= /* @__PURE__ */ new Map();
    this.#var.set(key, value);
  }, "set");
  /**
  * `.get()` can use the value specified by the key.
  *
  * @see {@link https://hono.dev/docs/api/context#set-get}
  *
  * @example
  * ```ts
  * app.get('/', (c) => {
  *   const message = c.get('message')
  *   return c.text(`The message is "${message}"`)
  * })
  * ```
  */
  get = /* @__PURE__ */ __name((key) => {
    return this.#var ? this.#var.get(key) : void 0;
  }, "get");
  /**
  * `.var` can access the value of a variable.
  *
  * @see {@link https://hono.dev/docs/api/context#var}
  *
  * @example
  * ```ts
  * const result = c.var.client.oneMethod()
  * ```
  */
  get var() {
    if (!this.#var) return {};
    return Object.fromEntries(this.#var);
  }
  #newResponse(data, arg, headers) {
    let responseHeaders = this.#res ? new Headers(this.#res.headers) : this.#preparedHeaders;
    if (typeof arg === "object" && arg.headers) {
      responseHeaders ??= new Headers();
      for (const [key, value] of new Headers(arg.headers)) if (key === "set-cookie") responseHeaders.append(key, value);
      else responseHeaders.set(key, value);
    }
    if (headers) {
      if (!responseHeaders) {
        let count = 0;
        for (const k in headers) if (++count > 1 || typeof headers[k] !== "string") {
          responseHeaders = new Headers();
          break;
        }
      }
      if (responseHeaders) for (const k in headers) {
        const v = headers[k];
        if (typeof v === "string") responseHeaders.set(k, v);
        else {
          responseHeaders.delete(k);
          for (const v2 of v) responseHeaders.append(k, v2);
        }
      }
    }
    const status = typeof arg === "number" ? arg : arg?.status ?? this.#status;
    return createResponseInstance(data, {
      status,
      headers: responseHeaders ?? headers
    });
  }
  newResponse = /* @__PURE__ */ __name((...args) => this.#newResponse(...args), "newResponse");
  /**
  * `.body()` can return the HTTP response.
  * You can set headers with `.header()` and set HTTP status code with `.status`.
  * This can also be set in `.text()`, `.json()` and so on.
  *
  * @see {@link https://hono.dev/docs/api/context#body}
  *
  * @example
  * ```ts
  * app.get('/welcome', (c) => {
  *   // Set headers
  *   c.header('X-Message', 'Hello!')
  *   c.header('Content-Type', 'text/plain')
  *   // Set HTTP status code
  *   c.status(201)
  *
  *   // Return the response body
  *   return c.body('Thank you for coming')
  * })
  * ```
  */
  body = /* @__PURE__ */ __name((data, arg, headers) => this.#newResponse(data, arg, headers), "body");
  /**
  * `.text()` can render text as `Content-Type:text/plain`.
  *
  * @see {@link https://hono.dev/docs/api/context#text}
  *
  * @example
  * ```ts
  * app.get('/say', (c) => {
  *   return c.text('Hello!')
  * })
  * ```
  */
  text = /* @__PURE__ */ __name((text, arg, headers) => {
    return !this.#preparedHeaders && !this.#status && !arg && !headers && !this.finalized ? new Response(text) : this.#newResponse(text, arg, setDefaultContentType(TEXT_PLAIN, headers));
  }, "text");
  /**
  * `.json()` can render JSON as `Content-Type:application/json`.
  *
  * @see {@link https://hono.dev/docs/api/context#json}
  *
  * @example
  * ```ts
  * app.get('/api', (c) => {
  *   return c.json({ message: 'Hello!' })
  * })
  * ```
  */
  json = /* @__PURE__ */ __name((object, arg, headers) => {
    return this.#newResponse(JSON.stringify(object), arg, setDefaultContentType("application/json", headers));
  }, "json");
  html = /* @__PURE__ */ __name((html, arg, headers) => {
    const res = /* @__PURE__ */ __name((html2) => this.#newResponse(html2, arg, setDefaultContentType("text/html; charset=UTF-8", headers)), "res");
    return typeof html === "object" ? resolveCallback(html, HtmlEscapedCallbackPhase.Stringify, false, {}).then(res) : res(html);
  }, "html");
  /**
  * `.redirect()` can Redirect, default status code is 302.
  *
  * @see {@link https://hono.dev/docs/api/context#redirect}
  *
  * @example
  * ```ts
  * app.get('/redirect', (c) => {
  *   return c.redirect('/')
  * })
  * app.get('/redirect-permanently', (c) => {
  *   return c.redirect('/', 301)
  * })
  * ```
  */
  redirect = /* @__PURE__ */ __name((location, status) => {
    const locationString = String(location);
    this.header("Location", !/[^\x00-\xFF]/.test(locationString) ? locationString : encodeURI(locationString));
    return this.newResponse(null, status ?? 302);
  }, "redirect");
  /**
  * `.notFound()` can return the Not Found Response.
  *
  * @see {@link https://hono.dev/docs/api/context#notfound}
  *
  * @example
  * ```ts
  * app.get('/notfound', (c) => {
  *   return c.notFound()
  * })
  * ```
  */
  notFound = /* @__PURE__ */ __name(() => {
    this.#notFoundHandler ??= () => createResponseInstance();
    return this.#notFoundHandler(this);
  }, "notFound");
};

// node_modules/hono/dist/compose.js
var compose = /* @__PURE__ */ __name((middleware, onError, onNotFound) => {
  return (context, next) => {
    let index = -1;
    return dispatch(0);
    async function dispatch(i) {
      if (i <= index) throw new Error("next() called multiple times");
      index = i;
      let res;
      let isError = false;
      let handler;
      if (middleware[i]) {
        handler = middleware[i][0][0];
        context.req.routeIndex = i;
      } else handler = i === middleware.length && next || void 0;
      if (handler) try {
        res = await handler(context, () => dispatch(i + 1));
      } catch (err) {
        if (err instanceof Error && onError) {
          context.error = err;
          res = await onError(err, context);
          isError = true;
        } else throw err;
      }
      else if (context.finalized === false && onNotFound) res = await onNotFound(context);
      if (res && (context.finalized === false || isError)) context.res = res;
      return context;
    }
    __name(dispatch, "dispatch");
  };
}, "compose");

// node_modules/hono/dist/router.js
var METHODS = [
  "get",
  "post",
  "put",
  "delete",
  "options",
  "patch",
  "query"
];
var MESSAGE_MATCHER_IS_ALREADY_BUILT = "Can not add a route since the matcher is already built.";
var UnsupportedPathError = class extends Error {
  static {
    __name(this, "UnsupportedPathError");
  }
};

// node_modules/hono/dist/utils/constants.js
var COMPOSED_HANDLER = "__COMPOSED_HANDLER";

// node_modules/hono/dist/hono-base.js
var notFoundHandler = /* @__PURE__ */ __name((c) => {
  return c.text("404 Not Found", 404);
}, "notFoundHandler");
var errorHandler = /* @__PURE__ */ __name((err, c) => {
  if ("getResponse" in err) {
    const res = err.getResponse();
    return c.newResponse(res.body, res);
  }
  console.error(err);
  return c.text("Internal Server Error", 500);
}, "errorHandler");
var Hono = class Hono2 {
  static {
    __name(this, "Hono");
  }
  get;
  post;
  put;
  delete;
  options;
  patch;
  query;
  all;
  on;
  use;
  router;
  getPath;
  _basePath = "/";
  #path = "/";
  routes = [];
  constructor(options = {}) {
    [...METHODS, "all"].forEach((method) => {
      this[method] = (args1, ...args) => {
        const methodName = method.toUpperCase();
        if (typeof args1 === "string") this.#path = args1;
        else this.#addRoute(methodName, this.#path, args1);
        args.forEach((handler) => {
          this.#addRoute(methodName, this.#path, handler);
        });
        return this;
      };
    });
    this.on = (method, path, ...handlers) => {
      for (const p of [path].flat()) {
        this.#path = p;
        for (const m of [method].flat()) {
          const methodName = m.toUpperCase();
          for (const handler of handlers) this.#addRoute(methodName, this.#path, handler);
        }
      }
      return this;
    };
    this.use = (arg1, ...handlers) => {
      if (typeof arg1 === "string") this.#path = arg1;
      else {
        this.#path = "*";
        handlers.unshift(arg1);
      }
      handlers.forEach((handler) => {
        this.#addRoute("ALL", this.#path, handler);
      });
      return this;
    };
    const { strict, ...optionsWithoutStrict } = options;
    Object.assign(this, optionsWithoutStrict);
    this.getPath = strict ?? true ? options.getPath ?? getPath : getPathNoStrict;
  }
  #clone() {
    const clone = new Hono2({
      router: this.router,
      getPath: this.getPath
    });
    clone.errorHandler = this.errorHandler;
    clone.#notFoundHandler = this.#notFoundHandler;
    clone.routes = this.routes;
    return clone;
  }
  #notFoundHandler = notFoundHandler;
  errorHandler = errorHandler;
  /**
  * `.route()` allows grouping other Hono instance in routes.
  *
  * @see {@link https://hono.dev/docs/api/routing#grouping}
  *
  * @param {string} path - base Path
  * @param {Hono} app - other Hono instance
  * @returns {Hono} routed Hono instance
  *
  * @example
  * ```ts
  * const app = new Hono()
  * const app2 = new Hono()
  *
  * app2.get("/user", (c) => c.text("user"))
  * app.route("/api", app2) // GET /api/user
  * ```
  */
  route(path, app2) {
    const subApp = this.basePath(path);
    app2.routes.map((r) => {
      let handler;
      if (app2.errorHandler === errorHandler) handler = r.handler;
      else {
        handler = /* @__PURE__ */ __name(async (c, next) => (await compose([], app2.errorHandler)(c, () => r.handler(c, next))).res, "handler");
        handler[COMPOSED_HANDLER] = r.handler;
      }
      subApp.#addRoute(r.method, r.path, handler, r.basePath);
    });
    return this;
  }
  /**
  * `.basePath()` allows base paths to be specified.
  *
  * @see {@link https://hono.dev/docs/api/routing#base-path}
  *
  * @param {string} path - base Path
  * @returns {Hono} changed Hono instance
  *
  * @example
  * ```ts
  * const api = new Hono().basePath('/api')
  * ```
  */
  basePath(path) {
    const subApp = this.#clone();
    subApp._basePath = mergePath(this._basePath, path);
    return subApp;
  }
  /**
  * `.onError()` handles an error and returns a customized Response.
  *
  * @see {@link https://hono.dev/docs/api/hono#error-handling}
  *
  * @param {ErrorHandler} handler - request Handler for error
  * @returns {Hono} changed Hono instance
  *
  * @example
  * ```ts
  * app.onError((err, c) => {
  *   console.error(`${err}`)
  *   return c.text('Custom Error Message', 500)
  * })
  * ```
  */
  onError = /* @__PURE__ */ __name((handler) => {
    this.errorHandler = handler;
    return this;
  }, "onError");
  /**
  * `.notFound()` allows you to customize a Not Found Response.
  *
  * @see {@link https://hono.dev/docs/api/hono#not-found}
  *
  * @param {NotFoundHandler} handler - request handler for not-found
  * @returns {Hono} changed Hono instance
  *
  * @example
  * ```ts
  * app.notFound((c) => {
  *   return c.text('Custom 404 Message', 404)
  * })
  * ```
  */
  notFound = /* @__PURE__ */ __name((handler) => {
    this.#notFoundHandler = handler;
    return this;
  }, "notFound");
  /**
  * `.mount()` allows you to mount applications built with other frameworks into your Hono application.
  *
  * @see {@link https://hono.dev/docs/api/hono#mount}
  *
  * @param {string} path - base Path
  * @param {Function} applicationHandler - other Request Handler
  * @param {MountOptions} [options] - options of `.mount()`
  * @returns {Hono} mounted Hono instance
  *
  * @example
  * ```ts
  * import { Router as IttyRouter } from 'itty-router'
  * import { Hono } from 'hono'
  * // Create itty-router application
  * const ittyRouter = IttyRouter()
  * // GET /itty-router/hello
  * ittyRouter.get('/hello', () => new Response('Hello from itty-router'))
  *
  * const app = new Hono()
  * app.mount('/itty-router', ittyRouter.handle)
  * ```
  *
  * @example
  * ```ts
  * const app = new Hono()
  * // Send the request to another application without modification.
  * app.mount('/app', anotherApp, {
  *   replaceRequest: (req) => req,
  * })
  * ```
  */
  mount(path, applicationHandler, options) {
    let replaceRequest;
    let optionHandler;
    if (options) {
      if (typeof options === "function") optionHandler = options;
      else {
        optionHandler = options.optionHandler;
        if (options.replaceRequest === false) replaceRequest = /* @__PURE__ */ __name((request) => request, "replaceRequest");
        else replaceRequest = options.replaceRequest;
      }
    }
    const getOptions = optionHandler ? (c) => {
      const options2 = optionHandler(c);
      return Array.isArray(options2) ? options2 : [options2];
    } : (c) => {
      let executionContext = void 0;
      try {
        executionContext = c.executionCtx;
      } catch {
      }
      return [c.env, executionContext];
    };
    replaceRequest ||= (() => {
      const mergedPath = mergePath(this._basePath, path);
      const pathPrefixLength = mergedPath === "/" ? 0 : mergedPath.length;
      return (request) => {
        const url = new URL(request.url);
        url.pathname = this.getPath(request).slice(pathPrefixLength) || "/";
        return new Request(url, request);
      };
    })();
    const handler = /* @__PURE__ */ __name(async (c, next) => {
      const res = await applicationHandler(replaceRequest(c.req.raw), ...getOptions(c));
      if (res) return res;
      await next();
    }, "handler");
    this.#addRoute("ALL", mergePath(path, "*"), handler);
    return this;
  }
  #addRoute(method, path, handler, baseRoutePath) {
    path = mergePath(this._basePath, path);
    const r = {
      basePath: baseRoutePath !== void 0 ? mergePath(this._basePath, baseRoutePath) : this._basePath,
      path,
      method,
      handler
    };
    this.router.add(method, path, [handler, r]);
    this.routes.push(r);
  }
  #handleError(err, c) {
    if (err instanceof Error) return this.errorHandler(err, c);
    throw err;
  }
  #dispatch(request, executionCtx, env, method) {
    if (method === "HEAD") return (async () => new Response(null, await this.#dispatch(request, executionCtx, env, "GET")))();
    const path = this.getPath(request, { env });
    const matchResult = this.router.match(method, path);
    const c = new Context(request, {
      path,
      matchResult,
      env,
      executionCtx,
      notFoundHandler: this.#notFoundHandler
    });
    if (matchResult[0].length === 1) {
      let res;
      try {
        res = matchResult[0][0][0][0](c, async () => {
          c.res = await this.#notFoundHandler(c);
        });
      } catch (err) {
        return this.#handleError(err, c);
      }
      return res instanceof Promise ? res.then((resolved) => resolved || (c.finalized ? c.res : this.#notFoundHandler(c))).catch((err) => this.#handleError(err, c)) : res ?? this.#notFoundHandler(c);
    }
    const composed = compose(matchResult[0], this.errorHandler, this.#notFoundHandler);
    return (async () => {
      try {
        const context = await composed(c);
        if (!context.finalized) throw new Error("Context is not finalized. Did you forget to return a Response object or `await next()`?");
        return context.res;
      } catch (err) {
        return this.#handleError(err, c);
      }
    })();
  }
  /**
  * `.fetch()` will be entry point of your app.
  *
  * @see {@link https://hono.dev/docs/api/hono#fetch}
  *
  * @param {Request} request - request Object of request
  * @param {Env} env - env Object
  * @param {ExecutionContext} executionCtx - context of execution
  * @returns {Response | Promise<Response>} response of request
  *
  */
  fetch = /* @__PURE__ */ __name((request, ...rest) => {
    return this.#dispatch(request, rest[1], rest[0], request.method);
  }, "fetch");
  /**
  * `.request()` is a useful method for testing.
  * You can pass a URL or pathname to send a GET request.
  * app will return a Response object.
  * ```ts
  * test('GET /hello is ok', async () => {
  *   const res = await app.request('/hello')
  *   expect(res.status).toBe(200)
  * })
  * ```
  * @see https://hono.dev/docs/api/hono#request
  */
  request = /* @__PURE__ */ __name((input, requestInit, Env, executionCtx) => {
    if (input instanceof Request) return this.fetch(requestInit ? new Request(input, requestInit) : input, Env, executionCtx);
    input = input.toString();
    return this.fetch(new Request(/^https?:\/\//.test(input) ? input : `http://localhost${mergePath("/", input)}`, requestInit), Env, executionCtx);
  }, "request");
  /**
  * `.fire()` automatically adds a global fetch event listener.
  * This can be useful for environments that adhere to the Service Worker API, such as non-ES module Cloudflare Workers.
  * @deprecated
  * Use `fire` from `hono/service-worker` instead.
  * ```ts
  * import { Hono } from 'hono'
  * import { fire } from 'hono/service-worker'
  *
  * const app = new Hono()
  * // ...
  * fire(app)
  * ```
  * @see https://hono.dev/docs/api/hono#fire
  * @see https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API
  * @see https://developers.cloudflare.com/workers/reference/migrate-to-module-workers/
  */
  fire = /* @__PURE__ */ __name(() => {
    addEventListener("fetch", (event) => {
      event.respondWith(this.#dispatch(event.request, event, void 0, event.request.method));
    });
  }, "fire");
};

// node_modules/hono/dist/router/utils.js
var createNullObject = /* @__PURE__ */ __name(() => /* @__PURE__ */ Object.create(null), "createNullObject");

// node_modules/hono/dist/router/reg-exp-router/matcher.js
var emptyParam = [];
function match(method, path) {
  const matchers = this.buildAllMatchers();
  const match2 = /* @__PURE__ */ __name(((method2, path2) => {
    const matcher = matchers[method2] || matchers["ALL"];
    const staticMatch = matcher[2][path2];
    if (staticMatch) return staticMatch;
    const match3 = path2.match(matcher[0]);
    if (!match3) return [[], emptyParam];
    const index = match3.indexOf("", 1);
    return [matcher[1][index], match3];
  }), "match");
  this.match = match2;
  return match2(method, path);
}
__name(match, "match");

// node_modules/hono/dist/router/reg-exp-router/node.js
var LABEL_REG_EXP_STR = "[^/]+";
var TAIL_WILDCARD_REG_EXP_STR = "(?:|/.*)";
var PATH_ERROR = /* @__PURE__ */ Symbol();
var regExpMetaChars = /* @__PURE__ */ new Set(".\\+*[^]$()");
function compareKey(a, b) {
  if (a.length === 1) return b.length === 1 ? a < b ? -1 : 1 : -1;
  if (b.length === 1) return 1;
  if (a === ".*" || a === "(?:|/.*)") return b === "(?:|/.*)" ? -1 : 1;
  else if (b === ".*" || b === "(?:|/.*)") return -1;
  if (a === "[^/]+") return 1;
  else if (b === "[^/]+") return -1;
  return a.length === b.length ? a < b ? -1 : 1 : b.length - a.length;
}
__name(compareKey, "compareKey");
var Node = class Node2 {
  static {
    __name(this, "Node");
  }
  #index;
  #varIndex;
  #children = createNullObject();
  insert(tokens, index, paramMap, context, isStatic) {
    let node = this;
    for (let i = 0, len = tokens.length; i < len; i++) {
      const token = tokens[i];
      const pattern = token.length === 1 ? token === "*" ? i === len - 1 ? [
        "",
        "",
        ".*"
      ] : [
        "",
        "",
        LABEL_REG_EXP_STR
      ] : null : token === "/*" ? [
        "",
        "",
        TAIL_WILDCARD_REG_EXP_STR
      ] : token.match(/^\:([^\{\}]+)(?:\{(.+)\})?$/);
      let nextNode;
      if (pattern) {
        const name = pattern[1];
        let regexpStr = pattern[2] || "[^/]+";
        if (name && pattern[2]) {
          if (regexpStr === ".*") throw PATH_ERROR;
          regexpStr = regexpStr.replace(/^\((?!\?:)(?=[^)]+\)$)/, "(?:");
          if (/\((?!\?:)/.test(regexpStr)) throw PATH_ERROR;
          if (regexpStr.length === 1 && regExpMetaChars.has(regexpStr)) throw PATH_ERROR;
        }
        nextNode = node.#children[regexpStr];
        if (!nextNode) {
          if (regexpStr !== ".*" && regexpStr !== "(?:|/.*)") {
            for (const k in node.#children) if ((regexpStr.length > 1 || k.length > 1) && k !== ".*" && k !== "(?:|/.*)") throw PATH_ERROR;
          }
          nextNode = node.#children[regexpStr] = new Node2();
        }
        if (name !== "") {
          nextNode.#varIndex ??= context.varIndex++;
          paramMap.push([name, nextNode.#varIndex]);
        }
      } else {
        nextNode = node.#children[token];
        if (!nextNode) {
          for (const k in node.#children) if (k.length > 1 && k !== ".*" && k !== "(?:|/.*)") throw PATH_ERROR;
          nextNode = node.#children[token] = new Node2();
        }
      }
      node = nextNode;
    }
    if (node.#index !== void 0) throw PATH_ERROR;
    node.#index = isStatic ? -1 : index;
  }
  buildRegExpStr() {
    const strList = Object.keys(this.#children).sort(compareKey).map((k) => {
      const c = this.#children[k];
      const childStr = c.buildRegExpStr();
      return childStr === "" ? "" : (typeof c.#varIndex === "number" ? `(${k})@${c.#varIndex}` : regExpMetaChars.has(k) ? `\\${k}` : k) + childStr;
    }).filter(Boolean);
    if (typeof this.#index === "number" && this.#index !== -1) strList.unshift(`#${this.#index}`);
    if (strList.length === 0) return "";
    if (strList.length === 1) return strList[0];
    return "(?:" + strList.join("|") + ")";
  }
};

// node_modules/hono/dist/router/reg-exp-router/trie.js
var Trie = class {
  static {
    __name(this, "Trie");
  }
  #context = { varIndex: 0 };
  #root = new Node();
  #index = 0;
  paths = createNullObject();
  insert(path, isStatic) {
    if (isStatic) {
      this.#root.insert(path.split(""), 0, [], this.#context, true);
      return;
    }
    const paramAssoc = [];
    const groups = [];
    let markedPath = path;
    for (let i = 0; ; ) {
      let replaced = false;
      markedPath = markedPath.replace(/\{[^}]+\}/g, (m) => {
        const mark = `@\\${i}`;
        groups[i] = [mark, m];
        i++;
        replaced = true;
        return mark;
      });
      if (!replaced) break;
    }
    const tokens = markedPath.match(/(?::[^\/]+)|(?:\/\*$)|./g) || [];
    for (let i = groups.length - 1; i >= 0; i--) {
      const [mark] = groups[i];
      for (let j = tokens.length - 1; j >= 0; j--) if (tokens[j].indexOf(mark) !== -1) {
        tokens[j] = tokens[j].replace(mark, groups[i][1]);
        break;
      }
    }
    this.#root.insert(tokens, this.#index, paramAssoc, this.#context, false);
    this.paths[path] = [this.#index++, paramAssoc];
  }
  buildRegExp() {
    let regexp = this.#root.buildRegExpStr();
    if (regexp === "") return [
      /^$/,
      [],
      []
    ];
    let captureIndex = 0;
    const indexReplacementMap = [];
    const paramReplacementMap = [];
    regexp = regexp.replace(/#(\d+)|@(\d+)|\.\*\$/g, (_, handlerIndex, paramIndex) => {
      if (handlerIndex !== void 0) {
        indexReplacementMap[++captureIndex] = Number(handlerIndex);
        return "$()";
      }
      if (paramIndex !== void 0) {
        paramReplacementMap[Number(paramIndex)] = ++captureIndex;
        return "";
      }
      return "";
    });
    return [
      new RegExp(`^${regexp}`),
      indexReplacementMap,
      paramReplacementMap
    ];
  }
};

// node_modules/hono/dist/router/reg-exp-router/router.js
var wildcardRegExpCache = createNullObject();
function buildWildcardRegExp(path) {
  return wildcardRegExpCache[path] ??= new RegExp(`^${path.replace(/\/:[^/{}]+(?:\{\[\^\/]\+})?(?=[/{]|$)|\/?\*$|([.\\+*[^\]$()?{}|])/g, (match2, metaChar) => metaChar ? `\\${metaChar}` : match2 === "/*" ? TAIL_WILDCARD_REG_EXP_STR : match2 === "*" ? ".*" : `/:${LABEL_REG_EXP_STR}`)}$`);
}
__name(buildWildcardRegExp, "buildWildcardRegExp");
function findMiddleware(middleware, path) {
  for (const k of Object.keys(middleware).sort((a, b) => b.length - a.length)) if (buildWildcardRegExp(k).test(path)) return [...middleware[k]];
}
__name(findMiddleware, "findMiddleware");
var RegExpRouter = class {
  static {
    __name(this, "RegExpRouter");
  }
  name = "RegExpRouter";
  #middleware;
  #routes;
  #tries;
  constructor() {
    this.#middleware = { ["ALL"]: createNullObject() };
    this.#routes = { ["ALL"]: createNullObject() };
    this.#tries = { ["ALL"]: new Trie() };
  }
  #insertPath(method, path) {
    try {
      this.#tries[method].insert(path, !/\*|\/:/.test(path));
    } catch (e) {
      throw e === PATH_ERROR ? new UnsupportedPathError(path) : e;
    }
  }
  add(method, path, handler) {
    const middleware = this.#middleware;
    const routes = this.#routes;
    if (!middleware) throw new Error(MESSAGE_MATCHER_IS_ALREADY_BUILT);
    if (!middleware[method]) {
      this.#tries[method] = new Trie();
      for (const handlerMap of [middleware, routes]) {
        handlerMap[method] = createNullObject();
        for (const p in handlerMap["ALL"]) {
          handlerMap[method][p] = [...handlerMap["ALL"][p]];
          this.#insertPath(method, p);
        }
      }
    }
    if (path === "/*") path = "*";
    const methods = method === "ALL" ? Object.keys(middleware) : [method];
    if (/\*$/.test(path)) {
      const re = buildWildcardRegExp(path);
      for (const m of methods) if (!middleware[m][path]) {
        this.#insertPath(m, path);
        middleware[m][path] = findMiddleware(middleware[m], path) || findMiddleware(middleware["ALL"], path) || [];
      }
      for (const handlerMap of [middleware, routes]) for (const m of methods) for (const p in handlerMap[m]) re.test(p) && handlerMap[m][p].push([handler, path]);
      return;
    }
    const paths = checkOptionalParameter(path) || [path];
    for (const path2 of paths) for (const m of methods) {
      if (!routes[m][path2]) {
        this.#insertPath(m, path2);
        routes[m][path2] = findMiddleware(middleware[m], path2) || findMiddleware(middleware["ALL"], path2) || [];
      }
      routes[m][path2].push([handler, path2]);
    }
  }
  match = match;
  buildAllMatchers() {
    const matchers = createNullObject();
    for (const method of Object.keys(this.#routes)) matchers[method] = this.#buildMatcher(method);
    this.#middleware = this.#routes = this.#tries = void 0;
    wildcardRegExpCache = createNullObject();
    return matchers;
  }
  #buildMatcher(method) {
    const middleware = this.#middleware[method];
    const routes = this.#routes[method];
    const trie = this.#tries[method];
    const staticMap = createNullObject();
    const handlerData = [];
    const [regexp, indexReplacementMap, paramReplacementMap] = trie.buildRegExp();
    for (const r of [middleware, routes]) for (const path in r) {
      const handlers = r[path];
      const pathData = trie.paths[path];
      if (!pathData) {
        staticMap[path] = [handlers.map(([h]) => [h, createNullObject()]), emptyParam];
        continue;
      }
      handlerData[pathData[0]] = handlers.map(([h, handlerPath]) => [h, trie.paths[handlerPath][1].reduceRight((map, [key], i) => {
        map[key] = paramReplacementMap[pathData[1][i][1]];
        return map;
      }, createNullObject())]);
    }
    return [
      regexp,
      indexReplacementMap.map((i) => handlerData[i]),
      staticMap
    ];
  }
};

// node_modules/hono/dist/router/smart-router/router.js
var SmartRouter = class {
  static {
    __name(this, "SmartRouter");
  }
  name = "SmartRouter";
  #routers = [];
  #routes = [];
  constructor(init) {
    this.#routers = init.routers;
  }
  add(method, path, handler) {
    if (!this.#routes) throw new Error(MESSAGE_MATCHER_IS_ALREADY_BUILT);
    this.#routes.push([
      method,
      path,
      handler
    ]);
  }
  match(method, path) {
    if (!this.#routes) throw new Error("Fatal error");
    const routers = this.#routers;
    const routes = this.#routes;
    const len = routers.length;
    let i = 0;
    let res;
    for (; i < len; i++) {
      const router = routers[i];
      try {
        for (let i2 = 0, len2 = routes.length; i2 < len2; i2++) router.add(...routes[i2]);
        res = router.match(method, path);
      } catch (e) {
        if (e instanceof UnsupportedPathError) continue;
        throw e;
      }
      this.match = router.match.bind(router);
      this.#routers = [router];
      this.#routes = void 0;
      break;
    }
    if (i === len) throw new Error("Fatal error");
    this.name = `SmartRouter + ${this.activeRouter.name}`;
    return res;
  }
  get activeRouter() {
    if (this.#routes || this.#routers.length !== 1) throw new Error("No active router has been determined yet.");
    return this.#routers[0];
  }
};

// node_modules/hono/dist/router/trie-router/node.js
var emptyParams = createNullObject();
var order = 0;
var Node3 = class Node4 {
  static {
    __name(this, "Node");
  }
  #methods = [];
  #children = createNullObject();
  #patterns = [];
  #pattern;
  #params = emptyParams;
  insert(method, path, handler) {
    let curNode = this;
    const parts = splitRoutingPath(path);
    const possibleKeys = /* @__PURE__ */ new Set();
    let i = 0;
    for (const p of parts) {
      const nextP = parts[++i];
      const pattern = getPattern(p, nextP) || (nextP === void 0 && p && p.indexOf("*") === p.length - 1 ? p : null);
      const isParam = Array.isArray(pattern);
      const key = isParam ? pattern[0] : pattern || p;
      const child = curNode.#children[key] ||= new Node4();
      if (pattern && !child.#pattern) {
        child.#pattern = pattern;
        curNode.#patterns.push(child);
      }
      curNode = child;
      if (isParam) possibleKeys.add(pattern[1]);
    }
    curNode.#methods.push({ [method]: {
      handler,
      possibleKeys: [...possibleKeys],
      score: ++order
    } });
  }
  #pushHandlerSets(handlerSets, node, method, nodeParams, params) {
    for (let i = 0, len = node.#methods.length; i < len; i++) {
      const m = node.#methods[i];
      const handlerSet = m[method] || m["ALL"];
      if (handlerSet) {
        handlerSet.params = createNullObject();
        handlerSets.push(handlerSet);
        for (let i2 = 0, len2 = handlerSet.possibleKeys.length; i2 < len2; i2++) {
          const key = handlerSet.possibleKeys[i2];
          handlerSet.params[key] = params?.[key] && !i2 ? params[key] : nodeParams[key] ?? params?.[key];
        }
      }
    }
  }
  search(method, path) {
    const handlerSets = [];
    this.#params = emptyParams;
    let curNodes = [this];
    const parts = splitPath(path);
    const curNodesQueue = [];
    const len = parts.length;
    let partOffsets = null;
    for (let i = 0; i < len; i++) {
      const part = parts[i];
      const isLast = i === len - 1;
      const tempNodes = [];
      for (let j = 0, len2 = curNodes.length; j < len2; j++) {
        const node = curNodes[j];
        const nextNode = node.#children[part];
        if (nextNode) {
          nextNode.#params = node.#params;
          if (isLast) {
            if (nextNode.#children["*"]) this.#pushHandlerSets(handlerSets, nextNode.#children["*"], method, node.#params);
            this.#pushHandlerSets(handlerSets, nextNode, method, node.#params);
          } else tempNodes.push(nextNode);
        }
        for (const child of node.#patterns) {
          const pattern = child.#pattern;
          const params = node.#params === emptyParams ? {} : { ...node.#params };
          if (typeof pattern === "string") {
            if (pattern === "*" || part.startsWith(pattern.slice(0, -1))) {
              this.#pushHandlerSets(handlerSets, child, method, node.#params);
              if (pattern === "*") {
                child.#params = params;
                tempNodes.push(child);
              }
            }
            continue;
          }
          const [, name, matcher] = pattern;
          if (!part && matcher === true) continue;
          if (matcher !== true) {
            if (!partOffsets) {
              partOffsets = [];
              let offset = path[0] === "/" ? 1 : 0;
              for (let p = 0; p < len; p++) {
                partOffsets[p] = offset;
                offset += parts[p].length + 1;
              }
            }
            const restPathString = path.slice(partOffsets[i]);
            const m = matcher.exec(restPathString);
            if (m) {
              params[name] = m[0];
              this.#pushHandlerSets(handlerSets, child, method, node.#params, params);
              if (m[0].length === restPathString.length && child.#children["*"]) this.#pushHandlerSets(handlerSets, child.#children["*"], method, node.#params, params);
              for (const _ in child.#children) {
                child.#params = params;
                const componentCount = m[0].match(/\//g)?.length ?? 0;
                (curNodesQueue[componentCount] ||= []).push(child);
                break;
              }
              continue;
            }
          }
          if (matcher === true || matcher.test(part)) {
            params[name] = part;
            if (isLast) {
              this.#pushHandlerSets(handlerSets, child, method, params, node.#params);
              if (child.#children["*"]) this.#pushHandlerSets(handlerSets, child.#children["*"], method, params, node.#params);
            } else {
              child.#params = params;
              tempNodes.push(child);
            }
          }
        }
      }
      const shifted = curNodesQueue.shift();
      curNodes = shifted ? tempNodes.concat(shifted) : tempNodes;
    }
    if (handlerSets[1]) handlerSets.sort((a, b) => {
      return a.score - b.score;
    });
    return [handlerSets.map(({ handler, params }) => [handler, params])];
  }
};

// node_modules/hono/dist/router/trie-router/router.js
var TrieRouter = class {
  static {
    __name(this, "TrieRouter");
  }
  name = "TrieRouter";
  #node = new Node3();
  add(method, path, handler) {
    for (const result of checkOptionalParameter(path) || [path]) this.#node.insert(method, result, handler);
  }
  match(method, path) {
    return this.#node.search(method, path);
  }
};

// node_modules/hono/dist/hono.js
var Hono3 = class extends Hono {
  static {
    __name(this, "Hono");
  }
  /**
  * Creates an instance of the Hono class.
  *
  * @param options - Optional configuration options for the Hono instance.
  */
  constructor(options = {}) {
    super(options);
    this.router = options.router ?? new SmartRouter({ routers: [new RegExpRouter(), new TrieRouter()] });
  }
};

// src/worker/time.ts
var nowSec = /* @__PURE__ */ __name(() => Math.floor(Date.now() / 1e3), "nowSec");
function offsetSec(env) {
  return Math.round(Number(env.TZ_OFFSET_HOURS || "-4") * 3600);
}
__name(offsetSec, "offsetSec");
function localDate(env, sec = nowSec()) {
  return new Date((sec + offsetSec(env)) * 1e3);
}
__name(localDate, "localDate");
function localToUnix(env, y, m, d, h = 0, min = 0) {
  return Math.floor(Date.UTC(y, m - 1, d, h, min) / 1e3) - offsetSec(env);
}
__name(localToUnix, "localToUnix");
function ymd(d) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}
__name(ymd, "ymd");
var DIAS = ["domingo", "lunes", "martes", "mi\xE9rcoles", "jueves", "viernes", "s\xE1bado"];
var DIAS_CORTO = ["dom", "lun", "mar", "mi\xE9", "jue", "vie", "s\xE1b"];
var MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
var MESES_CORTO = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
function horaTexto(d) {
  let h = d.getUTCHours();
  const m = d.getUTCMinutes();
  const suf = h < 12 ? "a. m." : "p. m.";
  h = h % 12 === 0 ? 12 : h % 12;
  return `${h}:${String(m).padStart(2, "0")} ${suf}`;
}
__name(horaTexto, "horaTexto");
function fechaLarga(d) {
  return `${DIAS[d.getUTCDay()]} ${d.getUTCDate()} de ${MESES[d.getUTCMonth()]}`;
}
__name(fechaLarga, "fechaLarga");
function fechaCorta(d) {
  return `${DIAS_CORTO[d.getUTCDay()]} ${d.getUTCDate()} ${MESES_CORTO[d.getUTCMonth()]}`;
}
__name(fechaCorta, "fechaCorta");
function cuandoTexto(env, dueSec) {
  const now = localDate(env);
  const due = localDate(env, dueSec);
  const dayDiff = Math.round((Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate()) - Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())) / 864e5);
  if (dayDiff === 0) return `hoy ${horaTexto(due)}`;
  if (dayDiff === 1) return `ma\xF1ana ${horaTexto(due)}`;
  if (dayDiff > 1 && dayDiff < 7) return `${DIAS[due.getUTCDay()]} ${horaTexto(due)}`;
  return fechaCorta(due);
}
__name(cuandoTexto, "cuandoTexto");
function daysBetween(env, fromSec, toSec) {
  const a = localDate(env, fromSec), b = localDate(env, toSec);
  return Math.round((Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate()) - Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate())) / 864e5);
}
__name(daysBetween, "daysBetween");

// src/worker/db.ts
var GLOBAL = /* @__PURE__ */ new Set(["vapid_keys", "app_origin", "tts_chars", "tts_day", "tg_secret", "tg_bot_token", "tg_username", "wa_display_number", "wa_last_error", "ai_fail_at", "ai_fail_detail"]);
var isGlobal = /* @__PURE__ */ __name((key) => GLOBAL.has(key) || key.startsWith("llm_"), "isGlobal");
var prefix = /* @__PURE__ */ __name((env) => `u${env.UID || 0}:`, "prefix");
var fullKey = /* @__PURE__ */ __name((env, key) => isGlobal(key) ? key : prefix(env) + key, "fullKey");
var DEFAULT_SETTINGS = {
  summary_hour: "7",
  summary_enabled: "1",
  task_reminders: "72,24,3",
  pay_open_day: "25",
  pay_close_day: "5",
  pay_remind_days: "25,30,4,5",
  pay_amount: "",
  term_start: "",
  term_end: "",
  eva_sync_hours: "2",
  term_unit: "trimestre",
  push_also_wa: "1",
  notify_tareas: "1",
  notify_notas: "1",
  notify_pagos: "1",
  notify_avisos: "1",
  notify_resumen: "1",
  notify_novedades: "1",
  study_hour: "19",
  study_enabled: "1",
  achievements_seen: "",
  notify_plan: "1",
  plan_hour: "18"
};
async function getSettings(env) {
  const p = prefix(env);
  const { results } = await env.DB.prepare(`SELECT key, value FROM settings WHERE substr(key, 1, ?) = ? OR key NOT LIKE 'u%:%'`).bind(p.length, p).all();
  const out = {};
  for (const r of results) {
    if (r.key.startsWith(p)) out[r.key.slice(p.length)] = r.value;
    else if (isGlobal(r.key)) out[r.key] = r.value;
  }
  return out;
}
__name(getSettings, "getSettings");
async function getSetting(env, key, fallback = "") {
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key = ?").bind(fullKey(env, key)).first();
  return row?.value ?? fallback;
}
__name(getSetting, "getSetting");
async function setSetting(env, key, value) {
  await env.DB.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(fullKey(env, key), value).run();
}
__name(setSetting, "setSetting");
async function userBySetting(env, key, value) {
  if (!value) return null;
  const row = await env.DB.prepare(`SELECT key FROM settings WHERE key LIKE ? AND value = ? LIMIT 1`).bind(`u%:${key}`, value).first();
  const m = row?.key.match(/^u(\d+):/);
  return m ? Number(m[1]) : null;
}
__name(userBySetting, "userBySetting");
async function markSent(env, key) {
  const r = await env.DB.prepare("INSERT OR IGNORE INTO sent_log (key, sent_at) VALUES (?, ?)").bind(prefix(env) + key, nowSec()).run();
  return (r.meta.changes ?? 0) > 0;
}
__name(markSent, "markSent");
async function wasSent(env, key) {
  return !!await env.DB.prepare("SELECT 1 AS x FROM sent_log WHERE key = ?").bind(prefix(env) + key).first();
}
__name(wasSent, "wasSent");
async function unmarkSent(env, key) {
  await env.DB.prepare("DELETE FROM sent_log WHERE key = ?").bind(prefix(env) + key).run();
}
__name(unmarkSent, "unmarkSent");
async function forUser(env, uid, role) {
  const u = { ...env, UID: uid };
  if (!role) role = (await env.DB.prepare("SELECT role FROM users WHERE id = ?").bind(uid).first())?.role || "user";
  u.ROLE = role;
  const s = await getSettings(u);
  const own = uid === 1;
  const pick2 = /* @__PURE__ */ __name((k, secret) => k in s ? s[k] || void 0 : own ? secret : void 0, "pick");
  u.MOODLE_TOKEN = s.moodle_token || (own ? env.MOODLE_TOKEN : void 0);
  u.WA_MY_NUMBER = s.wa_number || (own ? env.WA_MY_NUMBER : void 0);
  u.CALLMEBOT_APIKEY = pick2("callmebot_apikey", env.CALLMEBOT_APIKEY);
  return u;
}
__name(forUser, "forUser");
async function activeUsers(env) {
  const { results } = await env.DB.prepare("SELECT id, login, name, role, active FROM users WHERE active = 1 ORDER BY id").all();
  return results;
}
__name(activeUsers, "activeUsers");

// src/worker/auth.ts
var COOKIE = "rumbo_session";
var DAYS = 60;
var enc = new TextEncoder();
function b64url(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
__name(b64url, "b64url");
async function hmac(secret, data) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}
__name(hmac, "hmac");
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
__name(safeEqual, "safeEqual");
function randomHex(bytes) {
  return [...crypto.getRandomValues(new Uint8Array(bytes))].map((x) => x.toString(16).padStart(2, "0")).join("");
}
__name(randomHex, "randomHex");
var ITER = 1e5;
async function hashPassword(password, salt = randomHex(16)) {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: enc.encode(salt), iterations: ITER }, key, 256);
  return { hash: b64url(bits), salt };
}
__name(hashPassword, "hashPassword");
async function checkPassword(env, user, password) {
  if (!password) return false;
  if (user.pass_hash && user.pass_salt) return safeEqual((await hashPassword(password, user.pass_salt)).hash, user.pass_hash);
  return user.id === 1 && !!env.APP_PASSWORD && safeEqual(password, env.APP_PASSWORD);
}
__name(checkPassword, "checkPassword");
async function sessionVersion(env, uid) {
  return await getSetting({ ...env, UID: uid }, "session_version").catch(() => "") || "0";
}
__name(sessionVersion, "sessionVersion");
async function createSessionCookie(env, uid) {
  const exp = nowSec() + DAYS * 86400;
  const payload = `${uid}-${exp}-${await sessionVersion(env, uid)}`;
  const sig = await hmac(env.SESSION_SECRET || "", payload);
  return `${COOKIE}=${payload}.${sig}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${DAYS * 86400}`;
}
__name(createSessionCookie, "createSessionCookie");
function clearSessionCookie() {
  return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}
__name(clearSessionCookie, "clearSessionCookie");
async function sessionUser(env, cookieHeader) {
  if (!cookieHeader || !env.SESSION_SECRET) return null;
  const match2 = cookieHeader.split(/;\s*/).find((c) => c.startsWith(COOKIE + "="));
  if (!match2) return null;
  const [payload, sig] = match2.slice(COOKIE.length + 1).split(".");
  if (!payload || !sig) return null;
  if (!safeEqual(await hmac(env.SESSION_SECRET, payload), sig)) return null;
  const parts = payload.split("-");
  const [uid, exp, ver = "0"] = parts.length >= 3 ? [Number(parts[0]), parts[1], parts[2]] : [1, parts[0], parts[1] || "0"];
  if (!uid || Number(exp) < nowSec()) return null;
  if (ver !== await sessionVersion(env, uid)) return null;
  const u = await env.DB.prepare("SELECT active FROM users WHERE id = ?").bind(uid).first();
  return u?.active ? uid : null;
}
__name(sessionUser, "sessionUser");
async function verifyMetaSignature(env, body, header) {
  if (!env.WA_APP_SECRET) return true;
  if (!header?.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey("raw", enc.encode(env.WA_APP_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(body)));
  const hex = [...sig].map((b) => b.toString(16).padStart(2, "0")).join("");
  return safeEqual(hex, header.slice(7));
}
__name(verifyMetaSignature, "verifyMetaSignature");

// src/worker/wa.ts
function courseLabel(name, short) {
  if (short && !/\d{3,}|[-_]/.test(short)) return short;
  if (!name) return short || "";
  return name.length > 30 ? name.slice(0, 29).trimEnd() + "\u2026" : name;
}
__name(courseLabel, "courseLabel");
function timeLeft(dueSec, nowSec2) {
  const s = dueSec - nowSec2;
  if (s <= 0) return "ya venci\xF3";
  const min = Math.round(s / 60), h = Math.round(s / 3600), d = Math.round(s / 86400);
  if (min < 60) return `faltan ${min} minuto${min === 1 ? "" : "s"}`;
  if (h < 36) return h === 1 ? "falta 1 hora" : `faltan ${h} horas`;
  return d === 1 ? "falta 1 d\xEDa" : `faltan ${d} d\xEDas`;
}
__name(timeLeft, "timeLeft");
function money(amount) {
  const n = Number(String(amount).replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > 0 ? `RD$ ${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}` : `RD$ ${amount}`;
}
__name(money, "money");
function blocks(...parts) {
  return parts.filter((p) => !!p && !!p.trim()).join("\n\n");
}
__name(blocks, "blocks");

// src/worker/data.ts
function courseAverage(rows) {
  const g = rows.filter((r) => r.grade !== null && r.grade_max > 0);
  if (!g.length) return { avg: null, weighted: false };
  const weighted = g.every((r) => (r.weight ?? 0) > 0);
  if (weighted) {
    const w = g.reduce((a, r) => a + r.weight, 0);
    return { avg: g.reduce((a, r) => a + r.grade / r.grade_max * 100 * r.weight, 0) / w, weighted };
  }
  return { avg: g.reduce((a, r) => a + r.grade / r.grade_max * 100, 0) / g.length, weighted };
}
__name(courseAverage, "courseAverage");
async function bestGrades(env, courseId) {
  const { results } = await env.DB.prepare(`WITH best AS (SELECT g.id, g.course_id, g.moodle_item_id, g.grade, g.grade_max, g.weight FROM grades g WHERE g.user_id = ?1 AND g.id = (SELECT g2.id FROM grades g2
      WHERE g2.course_id = g.course_id AND COALESCE(g2.moodle_key, 'i' || g2.id) = COALESCE(g.moodle_key, 'i' || g.id) ORDER BY g2.grade IS NULL, g2.id LIMIT 1))
    SELECT * FROM best${courseId ? " WHERE course_id = ?2" : ""}`).bind(...courseId ? [env.UID, courseId] : [env.UID]).all();
  return results;
}
__name(bestGrades, "bestGrades");
async function listTasks(env, opts = {}) {
  const where = ["t.user_id = ?"];
  const binds = [env.UID];
  if (opts.status) {
    where.push("t.status = ?");
    binds.push(opts.status);
  }
  if (opts.id !== void 0) {
    where.push("t.id = ?");
    binds.push(opts.id);
  }
  if (opts.from !== void 0) {
    where.push("(t.due_at IS NULL OR t.due_at >= ?)");
    binds.push(opts.from);
  }
  if (opts.to !== void 0) {
    where.push("(t.due_at IS NULL OR t.due_at <= ?)");
    binds.push(opts.to);
  }
  const sql = `SELECT t.id, t.title, t.due_at, t.url, t.source, t.status, t.notes, t.submitted_at, t.course_id, t.focus_minutes,${opts.id !== void 0 ? " t.description," : ""}
      c.name AS course_name, c.short_name AS course_short, c.color AS course_color,
      COALESCE(NULLIF(c.facilitator, ''), c.facilitator_eva) AS facilitator,
      g.grade AS grade, g.grade_max AS grade_max, g.feedback AS grade_feedback, g.source AS grade_source,
      t.moodle_key, t.forum_posts, t.forum_replies, t.forum_needed${opts.id !== void 0 ? ", t.attachments" : ""}
    FROM tasks t LEFT JOIN courses c ON c.id = t.course_id
    -- Un foro trae dos renglones de nota (\xABcalificaci\xF3n\xBB y \xABforo completo\xBB): se usa el que tiene nota.
    LEFT JOIN grades g ON g.id = (SELECT g2.id FROM grades g2 WHERE g2.user_id = t.user_id AND g2.moodle_key = t.moodle_key ORDER BY g2.grade IS NULL, g2.updated_at DESC LIMIT 1)
    WHERE ${where.join(" AND ")}
    ORDER BY ${opts.status === "done" ? "COALESCE(t.due_at, t.submitted_at, t.updated_at) DESC" : "t.due_at IS NULL, t.due_at ASC"} LIMIT ?`;
  binds.push(opts.limit ?? 200);
  const { results } = await env.DB.prepare(sql).bind(...binds).all();
  return results;
}
__name(listTasks, "listTasks");
async function courseSummaries(env) {
  const { results } = await env.DB.prepare(`
    SELECT c.id, c.code, c.name, c.short_name, c.color, c.facilitator, c.facilitator_eva, c.eva_total, c.eva_total_max,
      (SELECT COUNT(*) FROM tasks t WHERE t.course_id = c.id AND t.status = 'pending') AS pending_tasks
    FROM courses c WHERE c.user_id = ? AND c.active = 1 ORDER BY c.name`).bind(env.UID).all();
  const rows = await bestGrades(env);
  return results.map((r) => {
    const mine = rows.filter((g) => g.course_id === r.id);
    const { avg, weighted } = courseAverage(mine);
    return { ...r, graded: mine.filter((g) => g.grade !== null).length, total: mine.length, average: avg === null ? null : Math.round(avg * 10) / 10, weighted: weighted ? 1 : 0 };
  });
}
__name(courseSummaries, "courseSummaries");
async function allGrades(env) {
  const { results } = await env.DB.prepare(`
    SELECT c.name AS course, g.item_name AS item, g.grade AS grade, g.grade_max AS grade_max, g.updated_at AS updated_at
    FROM grades g JOIN courses c ON c.id = g.course_id
    WHERE c.user_id = ? AND c.active = 1 ORDER BY g.updated_at DESC`).bind(env.UID).all();
  return results;
}
__name(allGrades, "allGrades");
function overallAverage(courses) {
  const vals = courses.map((c) => c.average).filter((v) => v !== null);
  if (!vals.length) return null;
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length * 10) / 10;
}
__name(overallAverage, "overallAverage");
async function payWindow(env, settings) {
  const s = settings ?? await getSettings(env);
  const openDay = Number(s.pay_open_day || 25);
  const closeDay = Number(s.pay_close_day || 5);
  const now = localDate(env);
  const y = now.getUTCFullYear(), m = now.getUTCMonth() + 1, d = now.getUTCDate();
  const crosses = closeDay < openDay;
  let open, py, pm;
  if (crosses) {
    if (d >= openDay) {
      open = true;
      py = y;
      pm = m;
    } else if (d <= closeDay) {
      open = true;
      py = m === 1 ? y - 1 : y;
      pm = m === 1 ? 12 : m - 1;
    } else {
      open = false;
      py = y;
      pm = m;
    }
  } else {
    if (d >= openDay && d <= closeDay) {
      open = true;
      py = y;
      pm = m;
    } else if (d < openDay) {
      open = false;
      py = y;
      pm = m;
    } else {
      open = false;
      py = m === 12 ? y + 1 : y;
      pm = m === 12 ? 1 : m + 1;
    }
  }
  const opensAt = localToUnix(env, py, pm, openDay, 0, 0);
  const cy = crosses ? pm === 12 ? py + 1 : py : py;
  const cm = crosses ? pm === 12 ? 1 : pm + 1 : pm;
  const closesAt = localToUnix(env, cy, cm, closeDay, 23, 59);
  const period = `${py}-${String(pm).padStart(2, "0")}`;
  const paid = !!await env.DB.prepare("SELECT 1 AS x FROM payments WHERE user_id = ? AND period = ?").bind(env.UID, period).first();
  const now_ = nowSec();
  return {
    state: open ? "open" : "closed",
    period,
    opensAt,
    closesAt,
    daysToOpen: Math.max(0, daysBetween(env, now_, opensAt)),
    daysToClose: Math.max(0, daysBetween(env, now_, closesAt)),
    paid,
    amount: s.pay_amount || "",
    openDay,
    closeDay
  };
}
__name(payWindow, "payWindow");
function periodLabel(period) {
  const [y, m] = period.split("-").map(Number);
  return `${MESES[m - 1]} ${y}`;
}
__name(periodLabel, "periodLabel");
async function termProgress(env, s) {
  if (!s.term_start || !s.term_end) return null;
  const [sy, sm, sd] = s.term_start.split("-").map(Number);
  const [ey, em, ed] = s.term_end.split("-").map(Number);
  const a = localToUnix(env, sy, sm, sd), b = localToUnix(env, ey, em, ed, 23, 59);
  const p = (nowSec() - a) / (b - a);
  return Math.round(Math.min(1, Math.max(0, p)) * 100);
}
__name(termProgress, "termProgress");
async function dashboard(env) {
  const s = await getSettings(env);
  const now = nowSec();
  const endOfToday = (() => {
    const d = localDate(env);
    return localToUnix(env, d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), 23, 59);
  })();
  const pending = await listTasks(env, { status: "pending", from: now - 3 * 86400, limit: 100 });
  const overdue = pending.filter((t) => t.due_at !== null && t.due_at < now);
  const today = pending.filter((t) => t.due_at !== null && t.due_at >= now && t.due_at <= endOfToday);
  const week = pending.filter((t) => t.due_at !== null && t.due_at > endOfToday && t.due_at <= now + 7 * 86400);
  const courses = await courseSummaries(env);
  const pay = await payWindow(env, s);
  const { results: recentGrades } = await env.DB.prepare(`SELECT t.id FROM tasks t JOIN grades g ON g.user_id = t.user_id AND g.moodle_key = t.moodle_key
    WHERE t.user_id = ? AND g.grade IS NOT NULL GROUP BY t.id ORDER BY MAX(g.updated_at) DESC, t.due_at DESC LIMIT 5`).bind(env.UID).all();
  const graded = recentGrades.length ? (await listTasks(env, { limit: 400 })).filter((t) => recentGrades.some((r) => r.id === t.id)).sort((a, b) => recentGrades.findIndex((r) => r.id === a.id) - recentGrades.findIndex((r) => r.id === b.id)) : [];
  const ld = localDate(env);
  const dow = (ld.getUTCDay() + 6) % 7;
  const weekStart = localToUnix(env, ld.getUTCFullYear(), ld.getUTCMonth() + 1, ld.getUTCDate() - dow, 0, 0);
  const wk = await env.DB.prepare(`SELECT COUNT(*) AS total, SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) AS done FROM tasks WHERE user_id = ? AND due_at >= ? AND due_at < ?`).bind(env.UID, weekStart, weekStart + 7 * 86400).first();
  const { results: news } = await env.DB.prepare(`SELECT a.id, a.title, a.kind, a.created_at, a.read, c.name AS course_name FROM announcements a LEFT JOIN courses c ON c.id = a.course_id
    WHERE a.user_id = ? AND (a.source = 'avisos' OR a.kind IN ('pago', 'evento') OR a.source = 'correo') ORDER BY a.created_at DESC LIMIT 3`).bind(env.UID).all();
  const unread = await env.DB.prepare(`SELECT COUNT(*) AS n FROM announcements WHERE user_id = ? AND read = 0 AND (source = 'avisos' OR kind IN ('pago', 'evento') OR source = 'correo')`).bind(env.UID).first();
  const fresh = await env.DB.prepare(`SELECT a.id, a.ext_id, a.title, a.body, a.url, a.course_id, a.created_at, c.name AS course_name, c.color AS course_color
    FROM announcements a LEFT JOIN courses c ON c.id = a.course_id WHERE a.user_id = ? AND a.source = 'notas' AND a.read = 0 AND a.created_at > ? ORDER BY a.created_at DESC LIMIT 1`).bind(env.UID, now - 4 * 86400).first();
  let freshGrade = null;
  if (fresh) {
    const [, itemId, grade] = fresh.ext_id.split(":").map(Number);
    const rows = fresh.course_id ? await bestGrades(env, fresh.course_id) : [];
    const now1 = courseAverage(rows).avg;
    const before = courseAverage(rows.filter((r) => r.moodle_item_id !== itemId && r.id !== itemId)).avg;
    const row = rows.find((r) => r.moodle_item_id === itemId || r.id === itemId);
    freshGrade = {
      id: fresh.id,
      title: fresh.title.replace(/^\S+\s/, "").replace(/:\s*[\d.,]+\/[\d.,]+$/, ""),
      grade,
      max: row?.grade_max ?? 100,
      feedback: fresh.body.startsWith("Comentario del facilitador:") ? fresh.body.replace("Comentario del facilitador:", "").trim() : "",
      course: fresh.course_name,
      color: fresh.course_color,
      url: fresh.url,
      average: now1 === null ? null : Math.round(now1 * 10) / 10,
      delta: now1 !== null && before !== null ? Math.round((now1 - before) * 10) / 10 : null
    };
  }
  const goalIds = (s.goals || "").split(",").filter(Boolean);
  const goals = [];
  if (goalIds.length) {
    const { results: wkTasks } = await env.DB.prepare(`SELECT status, due_at, submitted_at FROM tasks WHERE user_id = ? AND due_at >= ? AND due_at < ?`).bind(env.UID, weekStart, weekStart + 7 * 86400).all();
    for (const g of goalIds) {
      if (g === "atiempo") {
        const due = wkTasks.filter((t) => t.due_at <= now);
        const ok = due.filter((t) => t.status === "done").length;
        goals.push({ id: g, label: "Entregar todo a tiempo", done: ok, total: due.length, ok: ok === due.length, detail: due.length ? `${ok} de ${due.length} entregas que ya vencieron` : "Todav\xEDa no vence nada esta semana" });
      } else if (g === "antes") {
        const done = wkTasks.filter((t) => t.status === "done" && t.submitted_at);
        const early = done.filter((t) => t.submitted_at <= t.due_at - 86400).length;
        goals.push({ id: g, label: "Entregar un d\xEDa antes", done: early, total: wkTasks.length, ok: wkTasks.length > 0 && early === wkTasks.length, detail: `${early} de ${wkTasks.length} entregas de la semana con un d\xEDa de margen` });
      } else if (g.startsWith("promedio:")) {
        const target = Number(g.split(":")[1]) || 90;
        const { results: wkGrades } = await env.DB.prepare(`SELECT grade, grade_max FROM grades WHERE user_id = ? AND grade IS NOT NULL AND grade_max > 0 AND updated_at >= ?`).bind(env.UID, weekStart).all();
        const avg = wkGrades.length ? wkGrades.reduce((a, x) => a + x.grade / x.grade_max * 100, 0) / wkGrades.length : null;
        goals.push({ id: g, label: `Promedio de ${target} o m\xE1s`, done: avg === null ? 0 : Math.round(avg * 10) / 10, total: target, ok: avg !== null && avg >= target, detail: avg === null ? "Sin notas nuevas esta semana" : `Esta semana vas con ${Math.round(avg * 10) / 10} (${wkGrades.length} nota${wkGrades.length === 1 ? "" : "s"})` });
      }
    }
  }
  return {
    goals,
    goalIds,
    freshGrade,
    news,
    unreadNews: unread?.n ?? 0,
    weekProgress: { total: wk?.total ?? 0, done: wk?.done ?? 0 },
    graded,
    today: fechaLarga(localDate(env)),
    name: s.student_name || "",
    termProgress: await termProgress(env, s),
    counts: { pending: pending.filter((t) => t.due_at === null || t.due_at >= now).length, today: today.length, week: week.length, overdue: overdue.length },
    average: overallAverage(courses),
    tasks: pending.filter((t) => t.due_at === null || t.due_at >= now - 3 * 86400).slice(0, 12),
    courses,
    pay,
    lastSync: Number(s.eva_last_sync || 0) || null,
    lastSyncError: s.eva_last_error || "",
    summaryHour: Number(s.summary_hour || 7)
  };
}
__name(dashboard, "dashboard");
async function summaryShort(env) {
  const d = await dashboard(env);
  const now = nowSec();
  const next = d.tasks.find((t) => t.due_at !== null && t.due_at >= now);
  const overdue = d.tasks.filter((t) => t.due_at !== null && t.due_at < now).length;
  const parts = [];
  if (d.counts.today) parts.push(`\u{1F4CC} Hoy cierra${d.counts.today > 1 ? "n" : ""} ${d.counts.today} entrega${d.counts.today > 1 ? "s" : ""}`);
  else if (d.counts.week) parts.push(`\u{1F4C5} ${d.counts.week} entrega${d.counts.week > 1 ? "s" : ""} esta semana`);
  else parts.push("\u2705 Nada pendiente esta semana");
  if (next) parts.push(`Lo pr\xF3ximo: ${next.title}${next.course_short ? " (" + next.course_short + ")" : ""}, ${cuandoTexto(env, next.due_at)}`);
  if (overdue) parts.push(`\u26A0\uFE0F ${overdue} vencida${overdue > 1 ? "s" : ""} sin marcar`);
  const p = d.pay;
  if (!p.paid && p.state === "open") parts.push(`\u{1F4B3} La cuota cierra en ${p.daysToClose} d\xEDa(s)`);
  if (d.average !== null) parts.push(`\u{1F4CA} Promedio ${d.average}`);
  return parts.join("\n");
}
__name(summaryShort, "summaryShort");
async function summaryAlert(env) {
  const d = await dashboard(env);
  const now = nowSec();
  const hr = localDate(env).getUTCHours();
  const saludo = hr < 12 ? "\u2600\uFE0F *Buenos d\xEDas" : hr < 19 ? "\u{1F324}\uFE0F *Buenas tardes" : "\u{1F319} *Buenas noches";
  const item = /* @__PURE__ */ __name((t) => {
    const c = courseLabel(t.course_name, t.course_short);
    return `\u2022 ${t.title}${c ? ` _(${c})_` : ""} \xB7 ${t.due_at ? (t.due_at < now ? "venci\xF3 " : "") + cuandoTexto(env, t.due_at) : "sin fecha"}`;
  }, "item");
  const endToday = (() => {
    const l = localDate(env);
    return localToUnix(env, l.getUTCFullYear(), l.getUTCMonth() + 1, l.getUTCDate(), 23, 59);
  })();
  const overdue = d.tasks.filter((t) => t.due_at !== null && t.due_at < now);
  const today = d.tasks.filter((t) => t.due_at !== null && t.due_at >= now && t.due_at <= endToday);
  const soon = d.tasks.filter((t) => t.due_at === null || t.due_at > endToday).slice(0, 5);
  const B = [`${saludo}${d.name ? ", " + d.name : ""}*
_${d.today.charAt(0).toUpperCase() + d.today.slice(1)}_`];
  B.push(today.length ? `\u{1F4CC} *Hoy ${today.length === 1 ? "cierra 1 entrega" : `cierran ${today.length} entregas`}*
${today.map(item).join("\n")}` : "\u2705 *Hoy no vence nada*");
  if (overdue.length) B.push(`\u26A0\uFE0F *Atrasadas*
${overdue.map(item).join("\n")}`);
  if (soon.length) B.push(`\u{1F4C5} *Lo que viene*
${soon.map(item).join("\n")}`);
  const p = d.pay, extra = [];
  if (!p.paid && p.state === "open") extra.push(`\u{1F4B3} *Pago:* la ventana cierra en ${p.daysToClose} d\xEDa${p.daysToClose === 1 ? "" : "s"}${p.amount ? ` \xB7 ${money(p.amount)}` : ""}`);
  else if (!p.paid && p.daysToOpen <= 3) extra.push(`\u{1F4B3} *Pago:* la ventana abre en ${p.daysToOpen} d\xEDa${p.daysToOpen === 1 ? "" : "s"}`);
  if (d.average !== null) extra.push(`\u{1F4CA} *Promedio:* ${d.average}`);
  if (extra.length) B.push(extra.join("\n"));
  return B.join("\n\n");
}
__name(summaryAlert, "summaryAlert");
async function summaryText(env) {
  const d = await dashboard(env);
  const lines = [];
  const hr = localDate(env).getUTCHours();
  const saludo = hr < 12 ? "Buenos d\xEDas" : hr < 19 ? "Buenas tardes" : "Buenas noches";
  lines.push(`*${saludo}${d.name ? ", " + d.name : ""}.* Tu resumen de hoy, ${d.today}:`);
  lines.push("");
  const now = nowSec();
  const overdue = d.tasks.filter((t) => t.due_at !== null && t.due_at < now);
  const upcoming = d.tasks.filter((t) => t.due_at === null || t.due_at >= now);
  if (overdue.length) {
    lines.push("*Vencidas sin marcar:*");
    overdue.forEach((t) => lines.push(`\u2022 ${t.title}${t.course_short ? " (" + t.course_short + ")" : ""} \xB7 #${t.id}`));
    lines.push("");
  }
  if (upcoming.length) {
    lines.push("*Pendientes:*");
    upcoming.slice(0, 8).forEach((t) => lines.push(`\u2022 ${t.title}${t.course_short ? " (" + t.course_short + ")" : ""} \xB7 ${t.due_at ? cuandoTexto(env, t.due_at) : "sin fecha"} \xB7 #${t.id}`));
  } else {
    lines.push("No tienes entregas pendientes. Buen trabajo.");
  }
  lines.push("");
  const p = d.pay;
  if (p.paid) lines.push(`*Pago:* la cuota de ${periodLabel(p.period)} ya est\xE1 registrada.`);
  else if (p.state === "open") lines.push(`*Pago:* la ventana est\xE1 abierta; cierra en ${p.daysToClose} d\xEDa(s)${p.amount ? " \xB7 RD$ " + p.amount : ""}. Responde "pagu\xE9" cuando pagues.`);
  else if (p.daysToOpen <= 7) lines.push(`*Pago:* la ventana abre en ${p.daysToOpen} d\xEDa(s), el d\xEDa ${p.openDay}.`);
  if (d.average !== null) lines.push(`*Promedio de actividades:* ${d.average}`);
  lines.push("");
  lines.push('Responde "tareas", "notas", "pagos" o "ayuda".');
  return lines.join("\n");
}
__name(summaryText, "summaryText");

// src/worker/push.ts
var enc2 = new TextEncoder();
function b64u(data) {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  let s = "";
  for (let i = 0; i < bytes.length; i += 32768) s += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
__name(b64u, "b64u");
function unb64u(s) {
  const t = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(t + "=".repeat((4 - t.length % 4) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
__name(unb64u, "unb64u");
function concat(...parts) {
  const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
__name(concat, "concat");
async function vapidKeys(env) {
  const saved = await getSetting(env, "vapid_keys");
  if (saved) return JSON.parse(saved);
  const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const pub = await crypto.subtle.exportKey("raw", kp.publicKey);
  const keys = { publicKey: b64u(pub), privateJwk: await crypto.subtle.exportKey("jwk", kp.privateKey) };
  await env.DB.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)").bind("vapid_keys", JSON.stringify(keys)).run();
  return JSON.parse(await getSetting(env, "vapid_keys"));
}
__name(vapidKeys, "vapidKeys");
async function vapidPublicKey(env) {
  return (await vapidKeys(env)).publicKey;
}
__name(vapidPublicKey, "vapidPublicKey");
async function vapidAuth(env, endpoint) {
  const keys = await vapidKeys(env);
  const key = await crypto.subtle.importKey("jwk", keys.privateJwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const sub = await getSetting(env, "app_origin") || "https://rumbo.workers.dev";
  const header = b64u(enc2.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64u(enc2.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: nowSec() + 12 * 3600, sub })));
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc2.encode(`${header}.${claims}`));
  return `vapid t=${header}.${claims}.${b64u(sig)}, k=${keys.publicKey}`;
}
__name(vapidAuth, "vapidAuth");
async function hkdf(salt, ikm, info, bytes) {
  const k = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, k, bytes * 8));
}
__name(hkdf, "hkdf");
async function encryptPayload(p256dh, auth, payload) {
  const uaPub = unb64u(p256dh);
  const authSecret = unb64u(auth);
  const local = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const asPub = new Uint8Array(await crypto.subtle.exportKey("raw", local.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", uaPub, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdhParams = { name: "ECDH", public: uaKey };
  const shared = new Uint8Array(await crypto.subtle.deriveBits(ecdhParams, local.privateKey, 256));
  const ikm = await hkdf(authSecret, shared, concat(enc2.encode("WebPush: info\0"), uaPub, asPub), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc2.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc2.encode("Content-Encoding: nonce\0"), 12);
  const aes = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aes, concat(payload, new Uint8Array([2]))));
  const header = new Uint8Array(21);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = asPub.length;
  return concat(header, asPub, cipher);
}
__name(encryptPayload, "encryptPayload");
async function sendPushAll(env, msg) {
  const { results } = await env.DB.prepare("SELECT id, endpoint, p256dh, auth FROM push_subs WHERE user_id = ?").bind(env.UID).all();
  const payload = enc2.encode(JSON.stringify({ ...msg, body: msg.body.length > 1200 ? msg.body.slice(0, 1197) + "\u2026" : msg.body }));
  let sent = 0;
  let error;
  for (const s of results) {
    try {
      const res = await fetch(s.endpoint, {
        method: "POST",
        headers: {
          Authorization: await vapidAuth(env, s.endpoint),
          "Content-Encoding": "aes128gcm",
          "Content-Type": "application/octet-stream",
          TTL: String(24 * 3600),
          Urgency: "high"
        },
        body: await encryptPayload(s.p256dh, s.auth, payload)
      });
      if (res.status === 404 || res.status === 410) {
        await env.DB.prepare("DELETE FROM push_subs WHERE id = ?").bind(s.id).run();
        continue;
      }
      if (!res.ok) {
        error = `El servicio de notificaciones respondi\xF3 ${res.status}: ${(await res.text()).slice(0, 200)}`;
        continue;
      }
      sent++;
    } catch (e) {
      error = e.message;
    }
  }
  return { devices: results.length, sent, error };
}
__name(sendPushAll, "sendPushAll");

// src/worker/telegram.ts
var api = /* @__PURE__ */ __name((env) => `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}`, "api");
// El token del bot se puede guardar desde la app (/telegram). Si existe, manda sobre el secreto TELEGRAM_BOT_TOKEN.
var tgTokenCache = { v: "", at: 0 };
async function loadTelegramToken(env) {
  env.TG_TOKEN_SOURCE = env.TELEGRAM_BOT_TOKEN ? "secreto" : "";
  if (Date.now() - tgTokenCache.at > 6e4) {
    const row = await env.DB.prepare("SELECT value FROM settings WHERE key = 'tg_bot_token'").first().catch(() => null);
    tgTokenCache = { v: row?.value || "", at: Date.now() };
  }
  if (tgTokenCache.v) {
    env.TELEGRAM_BOT_TOKEN = tgTokenCache.v;
    env.TG_TOKEN_SOURCE = "app";
  }
  return env;
}
__name(loadTelegramToken, "loadTelegramToken");
var resetTelegramToken = /* @__PURE__ */ __name((v = "") => {
  tgTokenCache = { v, at: Date.now() };
}, "resetTelegramToken");
var TG_TOKEN_RE = /^\d{5,}:[A-Za-z0-9_-]{30,}$/;
var telegramReady = /* @__PURE__ */ __name((env) => !!env.TELEGRAM_BOT_TOKEN, "telegramReady");
async function tgCall(env, method, body = {}) {
  const res = await fetch(`${api(env)}/${method}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!data.ok) throw new Error(data.description || `Telegram respondi\xF3 ${res.status}`);
  return data.result;
}
__name(tgCall, "tgCall");
function toHtml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\*([^*\n]+)\*/g, "<b>$1</b>").replace(/(^|\s)_([^_\n]+)_(?=\s|$|[.,;:!?])/g, "$1<i>$2</i>");
}
__name(toHtml, "toHtml");
async function sendTelegram(env, text, chatId) {
  const chat = chatId ?? await getSetting(env, "tg_chat_id");
  if (!telegramReady(env) || !chat) return { ok: false, error: "Telegram no est\xE1 conectado" };
  try {
    await tgCall(env, "sendMessage", { chat_id: chat, text: toHtml(text).slice(0, 4e3), parse_mode: "HTML", link_preview_options: { is_disabled: true } });
    await env.DB.prepare("INSERT INTO messages (user_id, direction, channel, body) VALUES (?, ?, ?, ?)").bind(env.UID, "out", "telegram", text.slice(0, 4e3)).run();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
__name(sendTelegram, "sendTelegram");
async function downloadTelegramFile(env, fileId) {
  const f = await tgCall(env, "getFile", { file_id: fileId });
  if (!f.file_path) throw new Error("Telegram no entreg\xF3 el audio.");
  const res = await fetch(`https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${f.file_path}`);
  if (!res.ok) throw new Error(`No pude descargar el audio (${res.status}).`);
  return new Uint8Array(await res.arrayBuffer());
}
__name(downloadTelegramFile, "downloadTelegramFile");
function randomHex2(bytes) {
  return [...crypto.getRandomValues(new Uint8Array(bytes))].map((x) => x.toString(16).padStart(2, "0")).join("");
}
__name(randomHex2, "randomHex");
async function setupTelegram(env, origin) {
  const me = await tgCall(env, "getMe");
  let secret = await getSetting(env, "tg_secret");
  if (!secret) {
    secret = randomHex2(24);
    await setSetting(env, "tg_secret", secret);
  }
  let code = await getSetting(env, "tg_link_code");
  if (!code) {
    code = randomHex2(8);
    await setSetting(env, "tg_link_code", code);
  }
  await tgCall(env, "setWebhook", { url: `${origin}/api/telegram/webhook`, secret_token: secret, allowed_updates: ["message"], drop_pending_updates: true });
  await tgCall(env, "setMyCommands", { commands: [
    { command: "hoy", description: "Tu resumen del d\xEDa" },
    { command: "tareas", description: "Entregas pendientes" },
    { command: "notas", description: "Promedio por asignatura" },
    { command: "pagos", description: "Estado de la cuota" },
    { command: "ayuda", description: "Lo que puedo hacer" }
  ] }).catch(() => {
  });
  await setSetting(env, "tg_username", me.username);
  return { username: me.username, link: `https://t.me/${me.username}?start=${code}`, connected: !!await getSetting(env, "tg_chat_id") };
}
__name(setupTelegram, "setupTelegram");

// src/worker/notify.ts
var GRAPH = "https://graph.facebook.com/v21.0";
function waConfigured(env) {
  return !!(env.WA_PHONE_NUMBER_ID && env.WA_TOKEN && env.WA_MY_NUMBER);
}
__name(waConfigured, "waConfigured");
function waServerReady(env) {
  return !!(env.WA_PHONE_NUMBER_ID && env.WA_TOKEN);
}
__name(waServerReady, "waServerReady");
function callmebotConfigured(env) {
  return !!(env.CALLMEBOT_APIKEY && env.WA_MY_NUMBER);
}
__name(callmebotConfigured, "callmebotConfigured");
async function log(env, direction, channel, body) {
  await env.DB.prepare("INSERT INTO messages (user_id, direction, channel, body) VALUES (?, ?, ?, ?)").bind(env.UID, direction, channel, body.slice(0, 4e3)).run();
}
__name(log, "log");
async function logInbound(env, body) {
  await log(env, "in", "whatsapp", body);
}
__name(logInbound, "logInbound");
async function sendWhatsApp(env, text, to = env.WA_MY_NUMBER || "") {
  if (!waConfigured(env)) return { ok: false, error: "WhatsApp no configurado" };
  const res = await fetch(`${GRAPH}/${env.WA_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.WA_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { preview_url: false, body: text } })
  });
  if (!res.ok) {
    const err = (await res.text()).slice(0, 300);
    console.error(`WhatsApp no acept\xF3 el env\xEDo (${res.status}): ${err}`);
    await setSetting(env, "wa_last_error", `${(/* @__PURE__ */ new Date()).toISOString()} \xB7 env\xEDo ${res.status}: ${err}`);
    return { ok: false, error: err };
  }
  await log(env, "out", "whatsapp", text);
  return { ok: true };
}
__name(sendWhatsApp, "sendWhatsApp");
var CALLMEBOT_NUMBER = "34694242562";
var CALLMEBOT_ACTIVATE = "I allow callmebot to send me messages";
async function sendCallMeBot(env, text) {
  if (!callmebotConfigured(env)) return { ok: false, kind: "error", error: "CallMeBot no configurado" };
  const phone = "+" + (env.WA_MY_NUMBER || "").replace(/\D/g, "");
  const msg = text.length > 1500 ? text.slice(0, 1497) + "\u2026" : text;
  const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(phone)}&text=${encodeURIComponent(msg)}&apikey=${encodeURIComponent(env.CALLMEBOT_APIKEY || "")}`;
  let last = { ok: false, kind: "error", error: "Sin respuesta de CallMeBot" };
  for (const wait of [0, 1500, 3e3, 5e3]) {
    if (wait) await new Promise((r) => setTimeout(r, wait));
    let res;
    try {
      res = await fetch(url);
    } catch (e) {
      last = { ok: false, kind: "error", error: "No pude comunicarme con CallMeBot: " + e.message };
      continue;
    }
    const body = (await res.text()).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (res.status === 503 || /too many requests|to often|too often/i.test(body)) {
      last = { ok: false, kind: "busy", error: "CallMeBot est\xE1 saturado ahora mismo" };
      continue;
    }
    if (/apikey is invalid|invalid apikey|not valid/i.test(body)) return { ok: false, kind: "invalid", error: "La clave no coincide con ese n\xFAmero" };
    if (!res.ok || /(error|invalid)/i.test(body) && !/(queued|sent|enviado)/i.test(body)) return { ok: false, kind: "error", error: body.slice(0, 200) || `CallMeBot respondi\xF3 ${res.status}` };
    await log(env, "out", "callmebot", text);
    return { ok: true, kind: "ok" };
  }
  return last;
}
__name(sendCallMeBot, "sendCallMeBot");
async function queueWhatsApp(env, text) {
  const list = JSON.parse(await getSetting(env, "wa_outbox", "[]") || "[]");
  list.push({ t: text, at: nowSec() });
  await setSetting(env, "wa_outbox", JSON.stringify(list.filter((x) => nowSec() - x.at < 86400).slice(-8)));
}
__name(queueWhatsApp, "queueWhatsApp");
async function flushWhatsApp(env) {
  if (!callmebotConfigured(env)) return 0;
  const list = JSON.parse(await getSetting(env, "wa_outbox", "[]") || "[]").filter((x) => nowSec() - x.at < 86400);
  if (!list.length) return 0;
  const left = [];
  let sent = 0;
  for (const p of list) {
    if (left.length) {
      left.push(p);
      continue;
    }
    const r = await sendCallMeBot(env, p.t);
    if (r.ok) sent++;
    else if (r.kind === "busy") left.push(p);
  }
  await setSetting(env, "wa_outbox", JSON.stringify(left));
  return sent;
}
__name(flushWhatsApp, "flushWhatsApp");
async function waWindowOpen(env) {
  const last = Number(await getSetting(env, "wa_last_inbound", "0"));
  return nowSec() - last < 24 * 3600 - 15 * 60;
}
__name(waWindowOpen, "waWindowOpen");
async function waChatLink(env, text = "hoy") {
  if (!waServerReady(env)) return void 0;
  let num = await getSetting(env, "wa_display_number");
  if (!num) {
    const res = await fetch(`${GRAPH}/${env.WA_PHONE_NUMBER_ID}?fields=display_phone_number`, { headers: { Authorization: `Bearer ${env.WA_TOKEN}` } });
    if (!res.ok) return void 0;
    num = (await res.json()).display_phone_number?.replace(/\D/g, "") || "";
    if (!num) return void 0;
    await setSetting(env, "wa_display_number", num);
  }
  return `https://wa.me/${num}?text=${encodeURIComponent(text)}`;
}
__name(waChatLink, "waChatLink");
function plain(text) {
  return text.replace(/[*_~]/g, "").trim();
}
__name(plain, "plain");
async function sendToMe(env, text, opts = {}) {
  const channels = [];
  const errors = [];
  if (opts.type && await getSetting(env, `notify_${opts.type}`, "1") === "0") return { ok: true, channels };
  if (telegramReady(env) && await getSetting(env, "tg_chat_id")) {
    const t = await sendTelegram(env, text);
    if (t.ok) channels.push("telegram");
    else errors.push("Telegram: " + t.error);
  }
  const waTypes = (await getSetting(env, "wa_tipos", "")).split(",").filter(Boolean);
  const typeOk = !opts.type || !waTypes.length || waTypes.includes(opts.type) || opts.type === "plan" && waTypes.includes("resumen");
  const h = localDate(env).getUTCHours();
  const quiet = await getSetting(env, "wa_quiet", "1") !== "0" && (h >= 22 || h < 7) && opts.tag !== "security";
  if (callmebotConfigured(env) && typeOk && !quiet) {
    const origin = (env.APP_URL || await getSetting(env, "app_origin")).replace(/\/$/, "");
    const link = opts.url && origin ? `

\u{1F449} \xC1brelo en Rumbo:
${origin}/${opts.url.replace(/^\//, "")}` : "";
    const r = await sendCallMeBot(env, text.trim() + link);
    if (r.ok) channels.push("callmebot");
    else if (r.kind === "busy") await queueWhatsApp(env, text);
    else errors.push("WhatsApp: " + r.error);
  }
  const alsoPush = await getSetting(env, "push_also_wa", "1") !== "0";
  if (!channels.includes("callmebot") || alsoPush) {
    const lines = plain(text).split("\n");
    const title = opts.title || lines[0].slice(0, 80);
    const body = opts.pushBody || (opts.title ? lines : lines.slice(1)).join("\n").trim() || lines[0];
    const cnt = await env.DB.prepare(`SELECT (SELECT COUNT(*) FROM announcements WHERE user_id = ?1 AND read = 0 AND (source IN ('avisos', 'correo') OR kind IN ('pago', 'evento'))
        AND id > COALESCE((SELECT CAST(value AS INTEGER) FROM settings WHERE key = ?2), 0))
      + (SELECT COUNT(*) FROM tasks WHERE user_id = ?1 AND status = 'pending' AND due_at IS NOT NULL AND due_at < ?3 AND due_at > ?4) AS n`).bind(env.UID, `u${env.UID}:news_seen_id`, nowSec() + 86400, nowSec() - 3 * 86400).first().catch(() => null);
    const p = await sendPushAll(env, { title, body, tag: opts.tag, url: opts.url || "/#inicio", count: cnt?.n ?? 0 });
    if (p.sent) channels.push("push");
    else if (p.error) errors.push("Notificaci\xF3n: " + p.error);
  }
  if (channels.length) return { ok: true, channels };
  return { ok: false, channels, error: errors.join(" \xB7 ") || "No hay ning\xFAn canal activo: activa las notificaciones en Ajustes \u2192 Conexiones." };
}
__name(sendToMe, "sendToMe");

// src/worker/grades.ts
var fmt = /* @__PURE__ */ __name((n) => String(Math.round(n * 100) / 100), "fmt");
function gradeMessage(g) {
  const pct = g.max ? g.grade / g.max * 100 : 0;
  const icon = pct >= 90 ? "\u{1F389}" : pct >= 70 ? "\u2705" : "\u26A0\uFE0F";
  const cheer = pct >= 90 ? "\xA1Excelente trabajo!" : pct >= 70 ? "\xA1Bien hecho!" : "Revisa el comentario y preg\xFAntale al asistente c\xF3mo mejorar.";
  const changed = g.prev !== null && g.prev !== g.grade;
  const title = changed ? `${icon} Te cambiaron la nota: ${fmt(g.grade)}/${fmt(g.max)}` : `${icon} \xA1Te calificaron! ${fmt(g.grade)}/${fmt(g.max)}`;
  const head = `${g.item} \xB7 ${g.course}`;
  const fb = g.feedback ? `
\u{1F4AC} ${g.feedback.slice(0, 400)}` : "";
  const body = `${head}${changed ? `
Antes ten\xEDas ${fmt(g.prev)}.` : ""}
${cheer}${fb}`;
  return { icon, cheer, changed, title, head, body };
}
__name(gradeMessage, "gradeMessage");
async function notifyGrades(env, grades) {
  let sent = 0;
  for (const g of grades.slice(0, 8)) {
    const m = gradeMessage(g);
    const { icon, cheer, changed, title, head, body } = m;
    const task = g.key ? await env.DB.prepare("SELECT id FROM tasks WHERE user_id = ? AND moodle_key = ? LIMIT 1").bind(env.UID, g.key).first() : null;
    await env.DB.prepare(`INSERT OR IGNORE INTO announcements (user_id, source, ext_id, course_id, title, body, author, kind, url, created_at) VALUES (?, 'notas', ?, ?, ?, ?, 'EVA', 'nota', ?, ?)`).bind(env.UID, `${g.courseId}:${g.itemId}:${g.grade}`, g.courseId, `${icon} ${g.item}: ${fmt(g.grade)}/${fmt(g.max)}`, `${changed ? `Tu nota cambi\xF3 de ${fmt(g.prev)} a ${fmt(g.grade)}.

` : ""}${g.feedback ? `Comentario del facilitador:
${g.feedback}` : "Sin comentario del facilitador."}`, task ? `/#tareas/${task.id}` : null, nowSec()).run();
    const quote = g.feedback ? `\u{1F4AC} _Comentario del facilitador:_
${g.feedback.slice(0, 500).split("\n").filter((l) => l.trim()).map((l) => `> ${l}`).join("\n")}` : "";
    const r = await sendToMe(env, blocks(
      `${icon} *${changed ? "Te cambiaron una nota" : "\xA1Te calificaron!"}*`,
      [`*${g.item}*`, `\u{1F4DA} ${courseLabel(g.course)}`, `\u{1F4CA} Nota: *${fmt(g.grade)}/${fmt(g.max)}*${changed ? ` _(antes ${fmt(g.prev)})_` : ""}`].join("\n"),
      quote,
      cheer
    ), {
      title,
      tag: `grade-${g.courseId}-${g.itemId}`,
      url: task ? `/#tareas/${task.id}` : "/#asignaturas",
      pushBody: `${head}${g.feedback ? " \xB7 \u{1F4AC} " + g.feedback.slice(0, 120) : " \xB7 " + cheer}`,
      type: "notas"
    });
    if (r.ok) sent++;
  }
  return sent;
}
__name(notifyGrades, "notifyGrades");
async function notifyChanges(env, changes) {
  let sent = 0;
  for (const ch of changes.slice(0, 6)) {
    const curso = ch.course ? `\u{1F4DA} ${courseLabel(ch.course)}` : "";
    if (ch.kind === "fecha") {
      const later = ch.to > ch.from;
      const r = await sendToMe(
        env,
        blocks(`\u{1F5D3}\uFE0F *Cambi\xF3 una fecha de entrega*`, [`*${ch.title}*`, curso, `Antes: ~${cuandoTexto(env, ch.from)}~`, `Ahora: *${cuandoTexto(env, ch.to)}*`].filter(Boolean).join("\n"), later ? "_Te dieron m\xE1s tiempo \u{1F64C}_" : "_Ojo: ahora vence antes._"),
        { title: `\u{1F5D3}\uFE0F ${later ? "M\xE1s tiempo" : "Fecha adelantada"}: ${ch.title}`.slice(0, 90), pushBody: `${ch.course ? ch.course + " \xB7 " : ""}ahora vence ${cuandoTexto(env, ch.to)}`, tag: `date-${ch.taskId}`, url: `/#tareas/${ch.taskId}`, type: "tareas" }
      );
      if (r.ok) sent++;
    } else if (ch.kind === "nueva") {
      const r = await sendToMe(
        env,
        blocks("\u{1F195} *Tarea nueva en el EVA*", [`*${ch.title}*`, curso, `\u23F0 Vence *${cuandoTexto(env, ch.due)}*`].filter(Boolean).join("\n")),
        { title: `\u{1F195} ${ch.title}`.slice(0, 90), pushBody: `${ch.course ? ch.course + " \xB7 " : ""}vence ${cuandoTexto(env, ch.due)}`, tag: `new-${ch.taskId}`, url: `/#tareas/${ch.taskId}`, type: "tareas" }
      );
      if (r.ok) sent++;
    } else {
      const task = await env.DB.prepare("SELECT id FROM tasks WHERE user_id = ? AND moodle_key = ? LIMIT 1").bind(env.UID, ch.taskKey).first();
      const text = ch.text.length > 400 ? ch.text.slice(0, 400) + "\u2026" : ch.text;
      const r = await sendToMe(
        env,
        blocks(`\u{1F4AC} *${ch.author || "Alguien"} te respondi\xF3 en el foro*`, [`*${ch.title}*`, curso].filter(Boolean).join("\n"), text.split("\n").filter((l) => l.trim()).map((l) => `> ${l}`).join("\n")),
        { title: `\u{1F4AC} ${ch.author || "Alguien"} te respondi\xF3`, pushBody: `${ch.title} \xB7 ${text.slice(0, 140)}`, tag: `reply-${ch.taskKey}`, url: task ? `/#tareas/${task.id}` : "/#tareas", type: "tareas" }
      );
      if (r.ok) sent++;
    }
  }
  return sent;
}
__name(notifyChanges, "notifyChanges");

// src/worker/forums.ts
var NUM = "(\\d{1,3}(?:[.,]\\d{1,2})?)";
var KEYWORD = "(?:calificaci[o\xF3]n|nota|puntuaci[o\xF3]n|puntaje|valoraci[o\xF3]n)";
var FILL = "(?:\\s*(?:es|de|del|fue|final|obtenida|asignada|total|foro|este|en|:|=|-|\u2013)\\s*){0,4}";
var RX_KEYWORD = new RegExp(`${KEYWORD}${FILL}\\s*${NUM}(\\s*%)?(?:\\s*(?:\\/|de|sobre)\\s*(\\d{1,3})\\b)?`, "i");
var RX_VERB = new RegExp(`(?:obtuv\\w*|obtien\\w*|obtenido|alcanz\\w*|merece\\w*|asign[o\xF3]|otorg[o\xF3])\\s+(?:un[a]?\\s+|con\\s+)?${NUM}(\\s*%)?(?:\\s*(?:\\/|de|sobre)\\s*(\\d{1,3})\\b)?\\s*(?:puntos|pts)?`, "i");
function parseGradeText(text, gradeMax = 100) {
  const plain2 = text.replace(/\s+/g, " ");
  const m = plain2.match(RX_KEYWORD) || plain2.match(RX_VERB);
  if (!m) return null;
  const value = Number(m[1].replace(",", "."));
  let max = m[2] ? 100 : m[3] ? Number(m[3]) : null;
  if (max === null) max = value <= 10 && gradeMax > 10 ? 10 : gradeMax;
  if (!Number.isFinite(value) || max < 1 || max > 100 || value > max) return null;
  return { grade: value, max };
}
__name(parseGradeText, "parseGradeText");
var WORD_NUM = { un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5 };
function neededReplies(intro) {
  const t = intro.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ");
  const m = t.match(/(?:respond|comenta|retroaliment|reacciona|interactu|replica|valora|aporta)\w*\s+(?:a\s+|al\s+|en\s+)?(?:por lo menos|al menos|minimo|como minimo)?\s*(?:a\s+)?(?:los\s+|las\s+)?(\d|un|uno|una|dos|tres|cuatro|cinco)\s+(?:\(\d\)\s+)?(?:de\s+)?(?:sus\s+|tus\s+|los\s+|las\s+)?(?:companer|participant|aporte|intervencion|colega|publicacion)/);
  if (!m) return null;
  const n = /\d/.test(m[1]) ? Number(m[1]) : WORD_NUM[m[1]];
  return n && n <= 6 ? n : null;
}
__name(neededReplies, "neededReplies");
function combineRatings(values, assessed, scale) {
  if (!values.length) return null;
  const sum = values.reduce((a, b) => a + b, 0);
  const v = assessed === 2 ? values.length : assessed === 3 ? Math.max(...values) : assessed === 4 ? Math.min(...values) : assessed === 5 ? sum : sum / values.length;
  return scale > 0 ? Math.min(v, scale) : v;
}
__name(combineRatings, "combineRatings");
async function discussionPosts(env, discussionId) {
  try {
    const r = await moodleCall(env, "mod_forum_get_discussion_posts", { discussionid: discussionId, sortby: "created", sortdirection: "ASC" });
    return {
      posts: (r.posts || []).map((p) => ({ id: p.id, parent: p.parentid || 0, author: p.author?.id ?? 0, authorName: p.author?.fullname || "", text: htmlToText(p.message), created: p.timecreated || 0 })),
      ratings: r.ratinginfo?.ratings || [],
      contextid: r.ratinginfo?.contextid
    };
  } catch {
    const r = await moodleCall(env, "mod_forum_get_forum_discussion_posts", { discussionid: discussionId });
    return { posts: (r.posts || []).map((p) => ({ id: p.id, parent: p.parent, author: p.userid, authorName: p.userfullname || "", text: htmlToText(p.message), created: p.created || 0 })), ratings: [] };
  }
}
__name(discussionPosts, "discussionPosts");
async function wholeForumGrade(env, contextid, me) {
  const errors = [];
  let calls = 0;
  for (const fn of ["core_grades_grader_gradingpanel_point_fetch", "gradingform_rubric_grader_gradingpanel_fetch", "gradingform_guide_grader_gradingpanel_fetch", "core_grades_grader_gradingpanel_scale_fetch"]) {
    calls++;
    try {
      const r = await moodleCall(env, fn, { component: "mod_forum", contextid, itemname: "forum", gradeduserid: me });
      const g = r.grade || {};
      const raw2 = g.grade === null || g.grade === void 0 || g.grade === "" ? null : Number(g.grade);
      const fromText = g.usergrade ? Number(String(g.usergrade).replace(",", ".").match(/[\d.]+/)?.[0]) : NaN;
      const grade = raw2 !== null && Number.isFinite(raw2) ? raw2 : Number.isFinite(fromText) ? fromText : null;
      return { grade: r.hasgrade === false ? null : grade, max: Number(g.maxgrade) || null, feedback: htmlToText(g.feedback || ""), calls, debug: `${fn.split("_")[0]}:${r.hasgrade ? "con nota" : "sin nota"} ${g.usergrade ?? g.grade ?? ""}/${g.maxgrade ?? ""}` };
    } catch (e) {
      const m = e.message;
      errors.push(m.slice(0, 50));
      if (/permis|capabil|acceso|access/i.test(m)) break;
    }
  }
  return { grade: null, max: null, feedback: "", calls, debug: "error: " + errors.join(" / ") };
}
__name(wholeForumGrade, "wholeForumGrade");
async function scanForum(env, forum, me, gradeMax, facilitators, budget) {
  const finding = { forum, participated: false, firstPost: null, grade: null, max: null, feedback: "", how: null, debug: "", toMe: [], posts: 0, replies: 0, needed: neededReplies(htmlToText(forum.intro)) };
  let calls = 1;
  let discs;
  try {
    discs = (await moodleCall(env, "mod_forum_get_forum_discussions", { forumid: forum.id, sortorder: -1, page: 0, perpage: 40 })).discussions || [];
  } catch {
    calls++;
    discs = (await moodleCall(env, "mod_forum_get_forum_discussions_paginated", { forumid: forum.id, sortby: "timemodified", sortdirection: "DESC", page: 0, perpage: 40 })).discussions || [];
  }
  const norm = /* @__PURE__ */ __name((s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim(), "norm");
  const facs = facilitators.map(norm).filter(Boolean);
  const ranked = discs.length <= 3 ? discs : [
    ...discs.filter((d) => d.userid === me),
    ...discs.filter((d) => d.userid !== me && facs.some((f) => f.includes(norm(d.userfullname || "")) || norm(d.userfullname || "").includes(f))),
    ...discs.filter((d) => d.userid !== me)
  ];
  const seen = /* @__PURE__ */ new Set();
  const ratingValues = [];
  let best = null;
  let contextid;
  for (const d of ranked) {
    const id = d.discussion ?? d.id;
    if (seen.has(id) || seen.size >= 3 || calls >= budget) continue;
    seen.add(id);
    calls++;
    const { posts, ratings, contextid: ctx } = await discussionPosts(env, id);
    contextid ??= ctx;
    const mine = posts.filter((p) => p.author === me);
    if (!mine.length) continue;
    finding.participated = true;
    finding.firstPost = Math.min(finding.firstPost ?? Infinity, ...mine.map((p) => p.created));
    const mineIds = new Set(mine.map((p) => p.id));
    const root = posts.find((p) => !p.parent) || posts[0];
    for (const p of mine) {
      if (p.id === root.id || p.parent === root.id) finding.posts++;
      else finding.replies++;
    }
    for (const p of posts) if (p.author !== me && mineIds.has(p.parent)) finding.toMe.push({ id: p.id, author: p.authorName, text: p.text.slice(0, 600), created: p.created });
    const myRatings = ratings.filter((r) => mineIds.has(r.itemid)).map((r) => `${r.aggregatestr ?? r.aggregate ?? "-"}(${r.count ?? 0})`);
    const replies = posts.filter((p) => p.author !== me && mineIds.has(p.parent)).map((p) => p.text.replace(/\s+/g, " ").slice(0, 160));
    finding.debug += ` [d${id}: ${posts.length} msj, m\xEDos ${mine.length}, punt ${myRatings.join(",") || "ninguna"}, resp ${replies.length}${replies.length ? ": \xAB" + replies.join("\xBB \xAB") + "\xBB" : ""}]`;
    for (const r of ratings) if (mineIds.has(r.itemid) && typeof r.aggregate === "number" && (r.count ?? 1) > 0) ratingValues.push(r.aggregate);
    for (const p of posts) {
      if (p.author === me || !mineIds.has(p.parent)) continue;
      const g = parseGradeText(p.text, gradeMax);
      if (g && (!best || p.created >= best.at)) best = { at: p.created, ...g, text: p.text };
      else if (!best && !finding.feedback) finding.feedback = p.text.slice(0, 1500);
    }
  }
  finding.debug = `disc ${discs.length} scale ${forum.scale} assessed ${forum.assessed} gf ${forum.grade_forum}` + finding.debug;
  const scale = forum.scale ?? 0;
  const rated = scale > 0 ? combineRatings(ratingValues, forum.assessed ?? 1, scale) : null;
  if (rated !== null) {
    finding.grade = rated;
    finding.max = scale;
    finding.how = "puntuacion";
    if (best) finding.feedback = best.text.slice(0, 1500);
  } else if (best) {
    finding.grade = best.grade;
    finding.max = best.max;
    finding.how = "respuesta";
    finding.feedback = best.text.slice(0, 1500);
  } else if ((forum.grade_forum ?? 0) !== 0 && contextid && finding.participated && calls < budget) {
    const panel = await wholeForumGrade(env, contextid, me);
    calls += panel.calls;
    finding.debug += ` panel ${panel.debug}`;
    if (panel.grade !== null) {
      finding.grade = panel.grade;
      finding.max = panel.max || ((forum.grade_forum ?? 0) > 0 ? forum.grade_forum : 100);
      finding.how = "panel";
      if (panel.feedback) finding.feedback = panel.feedback;
    }
  }
  return { finding, calls };
}
__name(scanForum, "scanForum");

// src/worker/moodle.ts
var COLORS = ["#1F5FE0", "#12A5C9", "#7A5AF0", "#F08A1C", "#0F9F6E", "#D6457A", "#8A6D3B", "#3E4C6B"];
function flatten(params, prefix2 = "", out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(params)) {
    const key = prefix2 ? `${prefix2}[${k}]` : k;
    if (v === void 0 || v === null) continue;
    if (typeof v === "object") flatten(v, key, out);
    else out.append(key, String(v));
  }
  return out;
}
__name(flatten, "flatten");
var wsState = /* @__PURE__ */ new WeakMap();
var MEMO = /* @__PURE__ */ new Set(["mod_forum_get_forums_by_courses"]);
async function moodleCall(env, fn, params = {}) {
  const st = wsState.get(env);
  if (st && MEMO.has(fn)) {
    const k = fn + JSON.stringify(params);
    if (!st.memo.has(k)) st.memo.set(k, moodleCallRaw(env, fn, params));
    return st.memo.get(k);
  }
  return moodleCallRaw(env, fn, params);
}
__name(moodleCall, "moodleCall");
async function moodleCallRaw(env, fn, params = {}) {
  if (!env.MOODLE_TOKEN) throw new Error("Tu EVA no est\xE1 conectado. Con\xE9ctalo en Ajustes \u2192 Conexiones.");
  const st = wsState.get(env);
  if (st) st.calls++;
  const body = flatten({ wstoken: env.MOODLE_TOKEN, wsfunction: fn, moodlewsrestformat: "json", ...params });
  const res = await fetch(`${env.MOODLE_URL.replace(/\/$/, "")}/webservice/rest/server.php`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  if (!res.ok) throw new Error(`EVA respondi\xF3 ${res.status}`);
  const data = await res.json();
  if (data && typeof data === "object" && "exception" in data && data.exception) throw new Error(`EVA: ${data.message || data.errorcode}`);
  return data;
}
__name(moodleCallRaw, "moodleCallRaw");
function fixText(s) {
  return s.replace(/\uFFFD([\u0080-\u00BF])/g, (_, c) => String.fromCharCode(c.charCodeAt(0) + 64)).replace(/\uFFFD/g, "");
}
__name(fixText, "fixText");
function extractCode(c) {
  const m = `${c.shortname} ${c.fullname}`.match(/\b([A-Z]{3})[-\s]?(\d{3})\b/);
  return m ? `${m[1]}-${m[2]}` : null;
}
__name(extractCode, "extractCode");
async function syncFacilitators(env, moodleIds, result) {
  if (!moodleIds.length) return;
  const r = await moodleCall(env, "core_course_get_courses_by_field", { field: "ids", value: moodleIds.join(",") });
  for (const c of r.courses || []) {
    let names = (c.contacts || []).map((x) => x.fullname).filter(Boolean);
    if (!names.length) {
      try {
        const users = await moodleCall(env, "core_enrol_get_enrolled_users", { courseid: c.id, options: [{ name: "limitnumber", value: 300 }] });
        names = users.filter((u) => u.roles?.some((ro) => /teacher|facilitador|tutor/i.test(ro.shortname))).map((u) => u.fullname);
      } catch {
      }
    }
    if (!names.length) continue;
    await env.DB.prepare("UPDATE courses SET facilitator_eva = ? WHERE user_id = ? AND moodle_id = ?").bind([...new Set(names)].join(", "), env.UID, c.id).run();
    result.facilitators++;
  }
}
__name(syncFacilitators, "syncFacilitators");
async function fetchActivities(env, courseIds, result) {
  const acts = [];
  if (!courseIds.length) return acts;
  try {
    const r = await moodleCall(env, "mod_assign_get_assignments", { courseids: courseIds });
    for (const c of r.courses || []) for (const a of c.assignments || []) acts.push({ key: `assign:${a.id}`, module: "assign", cmid: a.cmid, name: a.name, due: a.duedate || null, moodleCourse: c.id, intro: a.intro, files: a.introattachments });
  } catch (e) {
    result.warnings.push("Tareas: " + e.message);
  }
  try {
    const r = await moodleCall(env, "mod_quiz_get_quizzes_by_courses", { courseids: courseIds });
    for (const q of r.quizzes || []) acts.push({ key: `quiz:${q.id}`, module: "quiz", cmid: q.coursemodule, name: q.name, due: q.timeclose || null, moodleCourse: q.course, intro: q.intro, files: q.introfiles });
  } catch (e) {
    result.warnings.push("Cuestionarios: " + e.message);
  }
  try {
    const r = await moodleCall(env, "mod_forum_get_forums_by_courses", { courseids: courseIds });
    for (const f of r || []) {
      if (f.type === "news") continue;
      const graded = (f.assessed ?? 0) > 0 || (f.grade_forum ?? 0) > 0;
      if (!graded && !f.duedate) continue;
      acts.push({ key: `forum:${f.id}`, module: "forum", cmid: f.cmid, name: f.name, due: f.duedate || f.cutoffdate || null, moodleCourse: f.course, intro: f.intro, files: f.introfiles });
    }
  } catch (e) {
    result.warnings.push("Foros: " + e.message);
  }
  return acts;
}
__name(fetchActivities, "fetchActivities");
function htmlToText(html) {
  return cleanNewsText((html || "").replace(/<\s*br\s*\/?>/gi, "\n").replace(/<\/(p|div|li|h\d)>/gi, "\n").replace(/<li[^>]*>/gi, "\u2022 ").replace(/<[^>]+>/g, ""));
}
__name(htmlToText, "htmlToText");
var ENTITIES = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", raquo: "\xBB", laquo: "\xAB", ndash: "\u2013", mdash: "\u2014", hellip: "\u2026", aacute: "\xE1", eacute: "\xE9", iacute: "\xED", oacute: "\xF3", uacute: "\xFA", ntilde: "\xF1", Aacute: "\xC1", Eacute: "\xC9", Iacute: "\xCD", Oacute: "\xD3", Uacute: "\xDA", Ntilde: "\xD1", uuml: "\xFC", iexcl: "\xA1", iquest: "\xBF" };
function cleanNewsText(text) {
  const cleaned = cleanLines(text);
  const lines = cleaned.split("\n");
  const start = lines.findIndex((l, i) => i < 12 && /^de .+ - .+\d{4}(, \d{1,2}:\d{2})?$/i.test(l));
  return start > 0 ? lines.slice(start).join("\n").trim() : cleaned;
}
__name(cleanNewsText, "cleanNewsText");
function cleanLines(text) {
  return text.replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, e) => e[0] === "#" ? String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENTITIES[e] ?? m).split("\n").map((l) => l.replace(/[ \t]+/g, " ").trim()).filter((l) => !/^(»|›|\.{3,}|mostrar mensaje anterior|ver este mensaje en contexto|responder|cambiar sus preferencias de notificaci.*|cancelar la suscripci.*|darse de baja.*)$/i.test(l)).join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
__name(cleanLines, "cleanLines");
function classifyNews(text) {
  const t = text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (/\b(pago|pagar|cuota|matricula|inscripcion|reinscripcion|factura|saldo|deuda|financ|beca|descuento|mora)\w*/.test(t)) return "pago";
  if (/\b(evento|webinar|conferencia|taller|charla|congreso|seminario|graduacion|feria|encuentro|convocatoria|jornada|simposio|actividad extracurricular|tutoria presencial)\w*/.test(t)) return "evento";
  if (/\b(calificacion|calificado|nota final|evaluacion|retroalimentacion)\w*/.test(t)) return "nota";
  return "aviso";
}
__name(classifyNews, "classifyNews");
async function syncNews(env, userid, courseMap, result) {
  const first = !await env.DB.prepare(`SELECT 1 AS x FROM announcements WHERE user_id = ? AND source IN ('avisos', 'eva') LIMIT 1`).bind(env.UID).first();
  const base = env.MOODLE_URL.replace(/\/$/, "");
  const save = /* @__PURE__ */ __name(async (source, extId, courseId, courseName, title, body, author, url, created) => {
    const kind = classifyNews(`${title} ${body}`);
    const row = await env.DB.prepare(`INSERT OR IGNORE INTO announcements (user_id, source, ext_id, course_id, title, body, author, url, kind, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`).bind(env.UID, source, extId, courseId, title.slice(0, 300), body.slice(0, 6e3), author, url, kind, created).first();
    if (row && !first) result.newNews.push({ id: row.id, title, body, kind, course: courseName, source });
  }, "save");
  const currentIds = [...courseMap].filter(([, c]) => c.current).map(([m]) => m);
  if (currentIds.length) {
    try {
      const forums = (await moodleCall(env, "mod_forum_get_forums_by_courses", { courseids: currentIds })).filter((f) => f.type === "news");
      for (const f of forums) {
        const course = courseMap.get(f.course);
        let discs = [];
        try {
          discs = (await moodleCall(env, "mod_forum_get_forum_discussions", { forumid: f.id, sortorder: -1, page: 0, perpage: 10 })).discussions || [];
        } catch {
          try {
            discs = (await moodleCall(env, "mod_forum_get_forum_discussions_paginated", { forumid: f.id, sortby: "timemodified", sortdirection: "DESC", page: 0, perpage: 10 })).discussions || [];
          } catch {
            continue;
          }
        }
        for (const d of discs) {
          const did = d.discussion ?? d.id;
          await save(
            "avisos",
            String(did),
            course?.id ?? null,
            course?.name ?? null,
            d.name || d.subject || "Aviso",
            htmlToText(d.message),
            d.userfullname || null,
            `${base}/mod/forum/discuss.php?d=${did}`,
            d.created || d.timemodified || nowSec()
          );
        }
      }
    } catch (e) {
      result.warnings.push("Avisos: " + e.message);
    }
  }
  try {
    const r = await moodleCall(env, "message_popup_get_popup_notifications", { useridto: userid, newestfirst: 1, limit: 25, offset: 0 });
    for (const n of r.notifications || []) {
      const body = htmlToText(n.fullmessagehtml) || n.fullmessage || n.smallmessage || "";
      await save("eva", String(n.id), null, null, n.subject || n.smallmessage || "Notificaci\xF3n del EVA", body, n.userfromfullname || null, n.contexturl || null, n.timecreated);
    }
  } catch (e) {
    result.warnings.push("Notificaciones: " + e.message);
  }
}
__name(syncNews, "syncNews");
async function syncPensumFromCourses(env) {
  const { results: pensum } = await env.DB.prepare("SELECT id, code, name, status FROM pensum WHERE user_id = ?").bind(env.UID).all();
  if (!pensum.length) return;
  const { results: courses } = await env.DB.prepare(`SELECT c.code, c.name, c.active,
      (SELECT AVG(g.grade * 100.0 / g.grade_max) FROM grades g WHERE g.course_id = c.id AND g.grade IS NOT NULL AND g.grade_max > 0) AS avg,
      (SELECT COUNT(*) FROM grades g WHERE g.course_id = c.id AND g.grade IS NULL) AS missing
    FROM courses c WHERE c.user_id = ? AND c.moodle_id IS NOT NULL`).bind(env.UID).all();
  const norm = /* @__PURE__ */ __name((x) => x.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim(), "norm");
  const same = /* @__PURE__ */ __name((a, b) => {
    const x = norm(a), y = norm(b);
    return x.length > 6 && y.length > 6 && (x.includes(y) || y.includes(x));
  }, "same");
  for (const c of courses) {
    const p = pensum.find((r) => c.code && r.code === c.code || same(r.name, c.name));
    if (!p || p.status === "aprobada") continue;
    if (c.active && p.status === "pendiente") {
      await env.DB.prepare(`UPDATE pensum SET status = 'en_curso' WHERE id = ?`).bind(p.id).run();
    } else if (!c.active && c.avg !== null && c.avg >= 70 && c.missing === 0) {
      await env.DB.prepare(`UPDATE pensum SET status = 'aprobada', grade = ? WHERE id = ?`).bind(Math.round(c.avg * 10) / 10, p.id).run();
    }
  }
}
__name(syncPensumFromCourses, "syncPensumFromCourses");
async function syncForumGrades(env, me, courseMap, delivered, result, part) {
  const currentIds = [...courseMap].filter(([, c]) => c.current).map(([m]) => m);
  if (!currentIds.length) return;
  const forums = (await moodleCall(env, "mod_forum_get_forums_by_courses", { courseids: currentIds })).filter((f) => f.type !== "news" && ((f.assessed ?? 0) > 0 || (f.grade_forum ?? 0) > 0));
  if (!forums.length) return;
  const { results: rows } = await env.DB.prepare(`SELECT id, course_id, moodle_key, item_name, grade, grade_max, source FROM grades WHERE user_id = ? AND moodle_key LIKE 'forum:%'`).bind(env.UID).all();
  const scanned = JSON.parse(await getSetting(env, "forum_scan", "{}"));
  const seenReplies = JSON.parse(await getSetting(env, "forum_replies_seen", "{}"));
  const { results: facRows } = await env.DB.prepare(`SELECT moodle_id, COALESCE(NULLIF(facilitator, ''), facilitator_eva) AS f FROM courses WHERE user_id = ?`).bind(env.UID).all();
  const now = nowSec();
  const todo = forums.filter((f) => !rows.some((r) => r.moodle_key === `forum:${f.id}` && r.grade !== null && r.source !== "foro")).filter((f) => {
    const due = f.duedate || f.cutoffdate || 0;
    return !due || due < now || now - (scanned[f.id] ?? 0) > (due - now < 3 * 86400 ? 6 * 3600 : 86400);
  }).sort((a, b) => (scanned[a.id] ?? 0) - (scanned[b.id] ?? 0));
  let budget = Math.max(0, Math.min(16, 44 - (wsState.get(env)?.calls ?? 0)));
  const log2 = [];
  for (const f of todo) {
    if (budget < 2) break;
    const key = `forum:${f.id}`;
    const course = courseMap.get(f.course);
    if (!course) continue;
    const own = rows.filter((r) => r.moodle_key === key).sort((a, b) => Number(/calificaci/i.test(b.item_name)) - Number(/calificaci/i.test(a.item_name)) || a.id - b.id);
    const gradeMax = own[0]?.grade_max || 100;
    const facs = (facRows.find((r) => r.moodle_id === f.course)?.f || "").split(",");
    let out;
    try {
      out = await scanForum(env, f, me, gradeMax, facs, budget);
    } catch (e) {
      log2.push(`${f.id}:error ${e.message.slice(0, 60)}`);
      budget -= 1;
      scanned[f.id] = now;
      continue;
    }
    budget -= out.calls;
    scanned[f.id] = now;
    const fd = out.finding;
    log2.push(`${f.id}:${fd.participated ? "particip\xF3" : "sin mensajes"}${fd.grade !== null ? ` nota ${fd.grade}/${fd.max} (${fd.how})` : ""} ${fd.debug.slice(0, 900)}`);
    part.set(key, { posts: fd.posts, replies: fd.replies, needed: fd.needed });
    const lastSeen = seenReplies[f.id];
    const fresh = fd.toMe.filter((r) => lastSeen !== void 0 && r.id > lastSeen);
    if (fd.toMe.length) seenReplies[f.id] = Math.max(lastSeen ?? 0, ...fd.toMe.map((r) => r.id));
    else if (lastSeen === void 0) seenReplies[f.id] = 0;
    for (const r of fresh.slice(-3)) result.changes.push({ kind: "respuesta", taskKey: key, title: fixText(f.name), course: course.name, author: r.author, text: r.text });
    if (fd.participated) delivered.add(key);
    if (fd.grade === null || !fd.max) continue;
    const target = own[0];
    const grade = Math.round(fd.grade / fd.max * gradeMax * 100) / 100;
    const feedback = fd.feedback || null;
    let itemId;
    if (target) {
      if (target.grade === grade && target.source === "foro") continue;
      await env.DB.prepare(`UPDATE grades SET grade = ?, source = 'foro', feedback = COALESCE(?, feedback), updated_at = ? WHERE id = ?`).bind(grade, feedback, now, target.id).run();
      itemId = target.id;
    } else {
      const prev = await env.DB.prepare("SELECT grade FROM grades WHERE course_id = ? AND moodle_item_id = ?").bind(course.id, -f.id).first();
      if (prev?.grade === grade) continue;
      await env.DB.prepare(`INSERT INTO grades (user_id, course_id, moodle_item_id, item_name, grade, grade_max, moodle_key, feedback, source, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'foro', ?)
        ON CONFLICT(course_id, moodle_item_id) DO UPDATE SET grade = excluded.grade, feedback = excluded.feedback, source = 'foro', updated_at = excluded.updated_at`).bind(env.UID, course.id, -f.id, fixText(f.name), grade, gradeMax, key, feedback, now).run();
      itemId = -f.id;
    }
    result.forumGrades++;
    result.newGrades.push({ course: course.name, courseId: course.id, item: fixText(f.name), grade, max: gradeMax, prev: target?.grade ?? null, feedback: fd.feedback, key, itemId });
  }
  await setSetting(env, "forum_scan", JSON.stringify(scanned));
  await setSetting(env, "forum_replies_seen", JSON.stringify(seenReplies));
  await setSetting(env, "forum_scan_log", `${new Date(now * 1e3).toISOString()} ${log2.join(" | ") || "nada que revisar"}`);
}
__name(syncForumGrades, "syncForumGrades");
async function syncEva(env) {
  const result = { forumGrades: 0, courses: 0, pastCourses: 0, delivered: 0, tasksNew: 0, tasksUpdated: 0, tasksClosed: 0, facilitators: 0, activities: 0, newGrades: [], newNews: [], warnings: [], changes: [] };
  wsState.set(env, { calls: 0, memo: /* @__PURE__ */ new Map() });
  try {
    const site = await moodleCall(env, "core_webservice_get_site_info");
    const fns = new Set((site.functions || []).map((f) => f.name));
    await setSetting(env, "eva_can", JSON.stringify({
      forumPost: fns.has("mod_forum_add_discussion_post"),
      submit: !!site.uploadfiles && fns.has("mod_assign_save_submission"),
      submitGrading: fns.has("mod_assign_submit_for_grading"),
      status: fns.has("mod_assign_get_submission_status")
    }));
    const hadTasks = !!await env.DB.prepare(`SELECT 1 AS x FROM tasks WHERE user_id = ? AND source = 'eva' LIMIT 1`).bind(env.UID).first();
    const now = nowSec();
    const all = await moodleCall(env, "core_enrol_get_users_courses", { userid: site.userid });
    const isCurrent = /* @__PURE__ */ __name((c) => (c.visible ?? 1) === 1 && (!c.enddate || c.enddate > now - 30 * 86400) && (!c.startdate || c.startdate < now + 30 * 86400), "isCurrent");
    const current = all.filter(isCurrent);
    const existing = await env.DB.prepare("SELECT moodle_id, color FROM courses WHERE user_id = ?").bind(env.UID).all();
    const used = new Set(existing.results.map((r) => r.color));
    const courseMap = /* @__PURE__ */ new Map();
    for (const c of all) {
      c.fullname = fixText(c.fullname);
      if (c.displayname) c.displayname = fixText(c.displayname);
      const active = isCurrent(c) ? 1 : 0;
      const color = COLORS.find((x) => !used.has(x)) || COLORS[c.id % COLORS.length];
      const code = extractCode(c);
      await env.DB.prepare(`UPDATE courses SET moodle_id = ? WHERE id = (SELECT id FROM courses WHERE user_id = ? AND moodle_id IS NULL AND (lower(name) = lower(?) OR (code IS NOT NULL AND code = ?)) LIMIT 1)
        AND NOT EXISTS (SELECT 1 FROM courses WHERE user_id = ? AND moodle_id = ?)`).bind(c.id, env.UID, c.displayname || c.fullname, code, env.UID, c.id).run();
      const row = await env.DB.prepare(`INSERT INTO courses (user_id, moodle_id, code, name, short_name, color, active, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, moodle_id) DO UPDATE SET name = excluded.name, short_name = excluded.short_name, code = COALESCE(courses.code, excluded.code), active = excluded.active, updated_at = excluded.updated_at
        RETURNING id, color`).bind(env.UID, c.id, code, c.displayname || c.fullname, c.shortname, color, active, now).first();
      if (row) {
        used.add(row.color);
        courseMap.set(c.id, { id: row.id, name: c.displayname || c.fullname, current: !!active });
      }
    }
    result.pastCourses = all.length - current.length;
    const currentIds = current.map((c) => c.id);
    if (currentIds.length) {
      await env.DB.prepare(`UPDATE courses SET active = 0 WHERE user_id = ? AND moodle_id IS NOT NULL AND moodle_id NOT IN (${currentIds.map(() => "?").join(",")})`).bind(env.UID, ...currentIds).run();
    }
    result.courses = current.length;
    try {
      await syncFacilitators(env, current.map((c) => c.id), result);
    } catch (e) {
      result.warnings.push("Facilitadores: " + e.message);
    }
    await syncNews(env, site.userid, courseMap, result);
    const delivered = /* @__PURE__ */ new Set();
    const pastQuota = Math.max(0, 30 - current.length);
    const pastChecked = await env.DB.prepare(`SELECT c.moodle_id AS m, MAX(g.updated_at) AS t FROM courses c LEFT JOIN grades g ON g.course_id = c.id WHERE c.user_id = ? AND c.active = 0 AND c.moodle_id IS NOT NULL GROUP BY c.moodle_id`).bind(env.UID).all();
    const lastCheck = new Map(pastChecked.results.map((r) => [r.m, r.t ?? 0]));
    const pastToCheck = new Set([...courseMap].filter(([, c]) => !c.current).map(([m]) => m).sort((a, b) => (lastCheck.get(a) ?? 0) - (lastCheck.get(b) ?? 0)).slice(0, pastQuota));
    for (const [moodleId, course] of courseMap) {
      if (!course.current && !pastToCheck.has(moodleId)) continue;
      try {
        const g = await moodleCall(env, "gradereport_user_get_grade_items", { courseid: moodleId, userid: site.userid });
        const all2 = g.usergrades?.[0]?.gradeitems || [];
        const total = all2.find((i) => i.itemtype === "course");
        if (total) await env.DB.prepare("UPDATE courses SET eva_total = ?, eva_total_max = ? WHERE id = ?").bind(total.graderaw, total.grademax || 100, course.id).run();
        const items = all2.filter((i) => i.itemtype === "mod" || i.itemtype === "manual");
        const known = await env.DB.prepare("SELECT COUNT(*) AS n FROM grades WHERE course_id = ?").bind(course.id).first();
        const firstSync = !known || known.n === 0;
        for (const it of items) {
          if (it.itemname) it.itemname = fixText(it.itemname);
          if (it.itemmodule && it.iteminstance && (it.graderaw !== null || it.gradedatesubmitted)) delivered.add(`${it.itemmodule}:${it.iteminstance}`);
          const prev = await env.DB.prepare("SELECT grade FROM grades WHERE course_id = ? AND moodle_item_id = ?").bind(course.id, it.id).first();
          const gKey = it.itemmodule && it.iteminstance ? `${it.itemmodule}:${it.iteminstance}` : null;
          const feedback = htmlToText(it.feedback || "").slice(0, 2e3);
          await env.DB.prepare(`INSERT INTO grades (user_id, course_id, moodle_item_id, item_name, grade, grade_max, moodle_key, feedback, weight, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(course_id, moodle_item_id) DO UPDATE SET item_name = excluded.item_name, grade_max = excluded.grade_max, moodle_key = excluded.moodle_key,
              updated_at = CASE WHEN (CASE WHEN excluded.grade IS NULL AND grades.source IN ('foro', 'manual') THEN grades.grade ELSE excluded.grade END) IS NOT grades.grade THEN excluded.updated_at ELSE grades.updated_at END,
              -- Una nota encontrada en el foro se conserva mientras el libro de calificaciones siga vac\xEDo.
              weight = excluded.weight,
              grade = CASE WHEN excluded.grade IS NULL AND grades.source IN ('foro', 'manual') THEN grades.grade ELSE excluded.grade END,
              feedback = CASE WHEN excluded.grade IS NULL AND grades.source IN ('foro', 'manual') THEN grades.feedback ELSE excluded.feedback END,
              source = CASE WHEN excluded.grade IS NULL AND grades.source IN ('foro', 'manual') THEN grades.source ELSE NULL END`).bind(env.UID, course.id, it.id, it.itemname || "Actividad", it.graderaw, it.grademax || 100, gKey, feedback || null, typeof it.weightraw === "number" ? it.weightraw : null, now).run();
          if (it.graderaw !== null && (!prev || prev.grade === null || prev.grade !== it.graderaw)) {
            if (!firstSync) result.newGrades.push({ course: course.name, courseId: course.id, item: it.itemname || "Actividad", grade: it.graderaw, max: it.grademax || 100, prev: prev?.grade ?? null, feedback, key: gKey, itemId: it.id });
          }
        }
      } catch {
      }
    }
    const participation = /* @__PURE__ */ new Map();
    try {
      await syncForumGrades(env, site.userid, courseMap, delivered, result, participation);
    } catch (e) {
      result.warnings.push("Notas de foros: " + e.message);
    }
    const LIMIT = 50;
    const ev = await moodleCall(env, "core_calendar_get_action_events_by_timesort", { timesortfrom: now - 45 * 86400, limitnum: LIMIT });
    const events = ev.events || [];
    const complete = events.length < LIMIT;
    const pendingKeys = /* @__PURE__ */ new Set();
    const seen = [];
    for (const e of events) {
      seen.push(e.id);
      const key = e.modulename && e.instance ? `${e.modulename}:${e.instance}` : null;
      if (key) pendingKeys.add(key);
      const courseId = e.course ? courseMap.get(e.course.id)?.id ?? null : null;
      const title = e.activityname || e.name.replace(/\s+(vence|debe entregarse|cierra|se cierra).*$/i, "");
      const prev = await env.DB.prepare("SELECT id, due_at, title, status FROM tasks WHERE user_id = ? AND (moodle_event_id = ? OR (moodle_key IS NOT NULL AND moodle_key = ?)) LIMIT 1").bind(env.UID, e.id, key).first();
      const courseName = e.course ? courseMap.get(e.course.id)?.name ?? null : null;
      if (!prev) {
        const ins = await env.DB.prepare(`INSERT INTO tasks (user_id, moodle_event_id, moodle_key, course_id, title, due_at, url, source, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'eva', 'pending') RETURNING id`).bind(env.UID, e.id, key, courseId, title, e.timesort, e.url || null).first();
        result.tasksNew++;
        if (hadTasks && ins && e.timesort > now) result.changes.push({ kind: "nueva", taskId: ins.id, title, course: courseName, due: e.timesort });
      } else {
        if (prev.due_at !== e.timesort || prev.title !== title) result.tasksUpdated++;
        if (prev.status === "pending" && prev.due_at && Math.abs(prev.due_at - e.timesort) > 3600) result.changes.push({ kind: "fecha", taskId: prev.id, title, course: courseName, from: prev.due_at, to: e.timesort });
        await env.DB.prepare("UPDATE tasks SET moodle_event_id = ?, moodle_key = COALESCE(moodle_key, ?), due_at = ?, title = ?, course_id = COALESCE(?, course_id), updated_at = ? WHERE id = ?").bind(e.id, key, e.timesort, title, courseId, now, prev.id).run();
      }
    }
    const acts = await fetchActivities(env, [...courseMap.keys()], result);
    result.activities = acts.length;
    const base = env.MOODLE_URL.replace(/\/$/, "");
    for (const a of acts) {
      const isPending = pendingKeys.has(a.key);
      const isDelivered = delivered.has(a.key);
      const goneFromCalendar = complete && !isPending && a.module !== "forum";
      const past = a.due !== null && a.due < now;
      const courseId = courseMap.get(a.moodleCourse)?.id ?? null;
      const url = `${base}/mod/${a.module}/view.php?id=${a.cmid}`;
      const note = isDelivered || goneFromCalendar && !past ? "Entregada en el EVA" : "Plazo cerrado en el EVA";
      const prev = await env.DB.prepare("SELECT id, status FROM tasks WHERE user_id = ? AND moodle_key = ?").bind(env.UID, a.key).first();
      if (prev) {
        if (prev.status === "done" && isDelivered) {
          await env.DB.prepare(`UPDATE tasks SET notes = 'Entregada en el EVA', submitted_at = COALESCE(submitted_at, ?), course_id = COALESCE(course_id, ?) WHERE id = ? AND notes = 'Plazo cerrado en el EVA'`).bind(now, courseId, prev.id).run();
        }
        if (prev.status === "pending" && !isPending && (isDelivered || goneFromCalendar)) {
          await env.DB.prepare(`UPDATE tasks SET status = 'done', submitted_at = COALESCE(submitted_at, ?), notes = COALESCE(notes, ?), updated_at = ? WHERE id = ?`).bind(note === "Entregada en el EVA" ? now : null, note, now, prev.id).run();
          result.tasksClosed++;
        }
        continue;
      }
      if (isPending) continue;
      if (isDelivered || goneFromCalendar && a.due !== null) {
        await env.DB.prepare(`INSERT OR IGNORE INTO tasks (user_id, moodle_key, course_id, title, due_at, url, source, status, notes, submitted_at) VALUES (?, ?, ?, ?, ?, ?, 'eva', 'done', ?, ?)`).bind(env.UID, a.key, courseId, a.name, a.due, url, note, note === "Entregada en el EVA" ? now : null).run();
        result.tasksNew++;
      } else if (a.module === "forum" && a.due && !past) {
        await env.DB.prepare(`INSERT OR IGNORE INTO tasks (user_id, moodle_key, course_id, title, due_at, url, source, status) VALUES (?, ?, ?, ?, ?, ?, 'eva', 'pending')`).bind(env.UID, a.key, courseId, a.name, a.due, url).run();
        result.tasksNew++;
      }
    }
    for (const [key, p] of participation) {
      await env.DB.prepare("UPDATE tasks SET forum_posts = ?, forum_replies = ?, forum_needed = ? WHERE user_id = ? AND moodle_key = ?").bind(p.posts, p.replies, p.needed, env.UID, key).run();
    }
    for (const a of acts) {
      const files = (a.files || []).filter((f) => f.fileurl).slice(0, 12).map((f) => ({ name: f.filename || "archivo", url: f.fileurl }));
      const json = files.length ? JSON.stringify(files) : null;
      await env.DB.prepare("UPDATE tasks SET attachments = ? WHERE user_id = ? AND moodle_key = ? AND attachments IS NOT ?").bind(json, env.UID, a.key, json).run();
    }
    for (const a of acts) {
      const text = htmlToText(a.intro).slice(0, 8e3);
      if (text) await env.DB.prepare("UPDATE tasks SET description = ? WHERE user_id = ? AND moodle_key = ? AND (description IS NULL OR description != ?)").bind(text, env.UID, a.key, text).run();
    }
    try {
      await syncPensumFromCourses(env);
    } catch (e) {
      result.warnings.push("Pensum: " + e.message);
    }
    if (complete) {
      const notIn = seen.length ? ` AND moodle_event_id NOT IN (${seen.map(() => "?").join(",")})` : "";
      const r = await env.DB.prepare(`UPDATE tasks SET status = 'done', submitted_at = COALESCE(submitted_at, ?), notes = COALESCE(notes, 'Entregada en el EVA'), updated_at = ?
        WHERE user_id = ? AND source = 'eva' AND status = 'pending' AND due_at > ? AND moodle_event_id IS NOT NULL${notIn}`).bind(now, now, env.UID, now, ...seen).run();
      result.tasksClosed += r.meta.changes ?? 0;
    }
    result.delivered = (await env.DB.prepare(`SELECT COUNT(*) AS n FROM tasks WHERE user_id = ? AND status = 'done' AND notes = 'Entregada en el EVA'`).bind(env.UID).first())?.n ?? 0;
    if (result.warnings.length) console.log("EVA avisos: " + result.warnings.join(" | "));
    console.log(`EVA: ${all.length} asignaturas en total (${result.pastCourses} de trimestres anteriores), ${result.delivered} entregas registradas`);
    console.log(`EVA: ${wsState.get(env)?.calls ?? 0} llamadas, ${result.forumGrades} notas sacadas de foros`);
    console.log(`EVA: ${result.courses} cursos, ${result.activities} actividades, ${result.tasksNew} nuevas, ${result.tasksClosed} cerradas, ${result.facilitators} con facilitador`);
    await setSetting(env, "eva_last_sync", String(now));
    await setSetting(env, "eva_last_error", "");
    await setSetting(env, "eva_user", site.fullname);
    if (result.newGrades.length) await notifyGrades(env, result.newGrades).catch((e) => console.log("Aviso de notas fall\xF3: " + e.message));
    if (result.changes.length) await notifyChanges(env, result.changes).catch((e) => console.log("Aviso de cambios fall\xF3: " + e.message));
    return result;
  } catch (e) {
    await setSetting(env, "eva_last_error", e.message.slice(0, 300));
    throw e;
  }
}
__name(syncEva, "syncEva");

// src/worker/health.ts
async function alertOnce(env, kind, title, body, url = "/#ajustes") {
  if (!await markSent(env, `alert:${kind}:${ymd(localDate(env))}`)) return false;
  await sendToMe(env, blocks(`*${title}*`, body), { title, pushBody: body, tag: `alert-${kind}`, url });
  return true;
}
__name(alertOnce, "alertOnce");
async function noteAiFailure(env, detail) {
  await setSetting(env, "ai_fail_at", String(nowSec())).catch(() => {
  });
  await setSetting(env, "ai_fail_detail", detail.slice(0, 300)).catch(() => {
  });
}
__name(noteAiFailure, "noteAiFailure");
async function checkHealth(env, extra = {}) {
  const log2 = [];
  const s = await getSettings(env);
  if (env.MOODLE_TOKEN && s.eva_last_error) {
    const expired = /token|invalid|inválid|expir|accessexception|webservice/i.test(s.eva_last_error);
    if (await alertOnce(
      env,
      "eva",
      expired ? "\u26A0\uFE0F El EVA dej\xF3 de conectar" : "\u26A0\uFE0F No pude sincronizar el EVA",
      expired ? "Parece que la conexi\xF3n con el EVA venci\xF3. Vuelve a conectarlo en Ajustes \u2192 Conexiones (toma un minuto)." : `Error: ${s.eva_last_error.slice(0, 160)}. Lo vuelvo a intentar solo.`
    )) log2.push("Alerta: EVA");
  }
  if (env.MOODLE_TOKEN && Number(s.eva_last_sync || 0) && nowSec() - Number(s.eva_last_sync) > 12 * 3600 && !s.eva_last_error) {
    if (await alertOnce(env, "eva-old", "\u26A0\uFE0F El EVA lleva horas sin sincronizar", "Abre Rumbo y toca Sincronizar. Si falla, revisa la conexi\xF3n del EVA en Ajustes.")) log2.push("Alerta: EVA atrasado");
  }
  if (env.ROLE === "admin" && Number(s.ai_fail_at || 0) > nowSec() - 1800) {
    if (await alertOnce(env, "ai", "\u26A0\uFE0F El asistente no pudo responder", `Todos los motores de IA fallaron. Abre Ajustes \u2192 Motores de IA \u2192 Probar motores. Detalle: ${(s.ai_fail_detail || "").slice(0, 120)}`)) log2.push("Alerta: IA");
  }
  if (extra.backupError && await alertOnce(env, "backup", "\u26A0\uFE0F Fall\xF3 la copia de seguridad", `Error: ${extra.backupError.slice(0, 160)}. Lo intento otra vez m\xE1s tarde.`)) log2.push("Alerta: copia");
  return log2;
}
__name(checkHealth, "checkHealth");

// src/worker/llm.ts
function providers(env) {
  const list = [];
  if (env.GROQ_API_KEY) list.push({ name: "Groq", url: "https://api.groq.com/openai/v1/chat/completions", modelsUrl: "https://api.groq.com/openai/v1/models", key: env.GROQ_API_KEY, fixed: env.GROQ_MODEL });
  if (env.CEREBRAS_API_KEY) list.push({ name: "Cerebras", url: "https://api.cerebras.ai/v1/chat/completions", modelsUrl: "https://api.cerebras.ai/v1/models", key: env.CEREBRAS_API_KEY });
  if (env.NVIDIA_API_KEY) list.push({ name: "NVIDIA", url: "https://integrate.api.nvidia.com/v1/chat/completions", modelsUrl: "https://integrate.api.nvidia.com/v1/models", key: env.NVIDIA_API_KEY, fixed: env.NVIDIA_MODEL });
  if (env.GEMINI_API_KEY) list.push({ name: "Gemini", url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", modelsUrl: "https://generativelanguage.googleapis.com/v1beta/openai/models", key: env.GEMINI_API_KEY, fixed: env.GEMINI_MODEL });
  if (env.OPENROUTER_API_KEY) list.push({ name: "OpenRouter", url: "https://openrouter.ai/api/v1/chat/completions", modelsUrl: "https://openrouter.ai/api/v1/models", key: env.OPENROUTER_API_KEY, onlyFree: true });
  return list;
}
__name(providers, "providers");
var PREFER = [
  /llama-4-maverick/i,
  /llama-3\.3-70b/i,
  /kimi-k2/i,
  /deepseek-v3/i,
  /qwen3-235b|qwen-3-235b/i,
  /llama-4-scout/i,
  /gemini-[\d.]+-flash(?!-lite)/i,
  /mistral-large|mistral-medium/i,
  /gpt-oss-120b/i,
  /llama-3\.1-405b/i,
  /qwen3-32b|qwen-3-32b|qwen3-next/i,
  /gemini-[\d.]+-flash-lite/i,
  /gpt-oss-20b/i,
  /gemma-3-27b/i,
  /llama-3\.1-70b|llama3-70b/i,
  /llama-3\.1-8b|llama3\.1-8b|llama-3\.2-3b/i
];
var NOT_CHAT = /whisper|guard|tts|embed|rerank|vision|vl-|-vl|audio|playai|orpheus|safety|reward|parse|ocr|clip|image|retriever|compound|distill|thinking|-r1|reasoner|coder|math|nemotron-nano|preview-tts|live|translate/i;
var MAX_CANDIDATES = 6;
var MAX_TRIES_PER_PROVIDER = 3;
async function getSetting2(env, key) {
  return (await env.DB.prepare("SELECT value FROM settings WHERE key = ?").bind(key).first())?.value || "";
}
__name(getSetting2, "getSetting");
async function putSetting(env, key, value) {
  await env.DB.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(key, value).run();
}
__name(putSetting, "putSetting");
var cooldown = /* @__PURE__ */ new Map();
var coolKey = /* @__PURE__ */ __name((p, m) => `${p.name}|${m}`, "coolKey");
var isCool = /* @__PURE__ */ __name((p, m) => (cooldown.get(coolKey(p, m)) || 0) > Date.now(), "isCool");
function rankModels(ids) {
  const usable = ids.filter((id) => !NOT_CHAT.test(id));
  const ranked = [];
  for (const re of PREFER) for (const id of usable) if (re.test(id) && !ranked.includes(id)) ranked.push(id);
  if (!ranked.length) ranked.push(...usable.slice(0, 3));
  return ranked.slice(0, MAX_CANDIDATES);
}
__name(rankModels, "rankModels");
async function listModels(p) {
  try {
    const res = await fetch(p.modelsUrl, { headers: { Authorization: `Bearer ${p.key}` } });
    if (!res.ok) {
      console.log(`IA: ${p.name} no list\xF3 modelos (${res.status})`);
      return [];
    }
    const data = (await res.json()).data || [];
    return data.map((m) => m.id.replace(/^models\//, "")).filter((id) => !NOT_CHAT.test(id) && (!p.onlyFree || id.endsWith(":free")));
  } catch {
    return [];
  }
}
__name(listModels, "listModels");
async function candidates(env, p, refresh = false) {
  if (p.fixed) return [p.fixed];
  const key = `llm_models_${p.name.toLowerCase()}`;
  const bad = new Set(JSON.parse(await getSetting2(env, `llm_bad_${p.name.toLowerCase()}`) || "[]"));
  if (!refresh) {
    try {
      const saved = JSON.parse(await getSetting2(env, key) || "null");
      if (saved && Date.now() - saved.at < 864e5 && saved.ids.some((m) => !bad.has(m))) return saved.ids.filter((m) => !bad.has(m));
    } catch {
    }
  }
  const top = rankModels((await listModels(p)).filter((m) => !bad.has(m)));
  if (top.length) {
    await putSetting(env, key, JSON.stringify({ at: Date.now(), ids: top }));
    console.log(`IA: ${p.name} \u2192 ${top.join(", ")}`);
  }
  return top;
}
__name(candidates, "candidates");
async function markBad(env, p, model) {
  const k = `llm_bad_${p.name.toLowerCase()}`;
  const bad = JSON.parse(await getSetting2(env, k) || "[]");
  if (!bad.includes(model)) {
    bad.push(model);
    await putSetting(env, k, JSON.stringify(bad.slice(-60)));
  }
}
__name(markBad, "markBad");
var modelGone = /* @__PURE__ */ __name((status, body) => status === 404 || status === 410 || status === 400 && /model|not (found|supported)|does not exist|decommission/i.test(body), "modelGone");
async function* openAiDeltas(body) {
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (; ; ) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() || "";
    for (const line of lines) {
      const m = line.match(/^data:\s*(.*)$/);
      if (!m || m[1] === "[DONE]") continue;
      try {
        const j = JSON.parse(m[1]);
        const t = j.choices?.[0]?.delta?.content ?? j.response ?? "";
        if (t) yield t;
      } catch {
      }
    }
  }
}
__name(openAiDeltas, "openAiDeltas");
async function firstThenRest(gen) {
  const first = await gen.next();
  if (first.done || !first.value.trim()) {
    let acc = first.done ? "" : first.value;
    for (let n = first; !n.done && !acc.trim(); ) {
      n = await gen.next();
      if (!n.done) acc += n.value;
    }
    if (!acc.trim()) return null;
    return (async function* () {
      yield acc;
      yield* gen;
    })();
  }
  return (async function* () {
    yield first.value;
    yield* gen;
  })();
}
__name(firstThenRest, "firstThenRest");
var WORKERS_MODELS = ["@cf/meta/llama-3.3-70b-instruct-fp8-fast", "@cf/meta/llama-4-scout-17b-16e-instruct"];
function bodyFor(p, model, messages, opts, stream) {
  const b = { model, messages, max_tokens: opts.maxTokens, temperature: opts.temperature, stream };
  if (/gpt-oss/i.test(model) && (p.name === "Groq" || p.name === "Cerebras")) {
    b.reasoning_effort = "low";
    b.max_tokens = opts.maxTokens + 400;
  }
  if (/qwen3/i.test(model) && p.name === "Groq") b.reasoning_effort = "none";
  return b;
}
__name(bodyFor, "bodyFor");
async function tryModel(env, p, model, messages, opts) {
  try {
    const res = await fetch(p.url, {
      method: "POST",
      headers: { Authorization: `Bearer ${p.key}`, "Content-Type": "application/json" },
      body: JSON.stringify(bodyFor(p, model, messages, opts, true)),
      signal: AbortSignal.timeout(2e4)
    });
    if (res.ok && res.body) {
      const deltas = await firstThenRest(openAiDeltas(res.body));
      if (deltas) return { deltas };
      cooldown.set(coolKey(p, model), Date.now() + 5 * 6e4);
      return { error: `${p.name} ${model}: respuesta vac\xEDa` };
    }
    const body = await res.text().catch(() => "");
    if (res.status === 429) {
      const wait = Number(res.headers.get("retry-after")) || 60;
      cooldown.set(coolKey(p, model), Date.now() + Math.min(wait, 3600) * 1e3);
    } else if (modelGone(res.status, body) && !p.fixed) {
      await markBad(env, p, model);
    } else {
      cooldown.set(coolKey(p, model), Date.now() + 3e4);
    }
    return { error: `${p.name} ${model} ${res.status}: ${body.slice(0, 100)}` };
  } catch (e) {
    cooldown.set(coolKey(p, model), Date.now() + 3e4);
    return { error: `${p.name} ${model}: ${e.message}` };
  }
}
__name(tryModel, "tryModel");
async function llmStream(env, messages, opts) {
  const errors = [];
  for (const p of providers(env)) {
    let list = await candidates(env, p);
    if (!list.length) list = await candidates(env, p, true);
    let tries = 0;
    for (const model of list) {
      if (tries >= MAX_TRIES_PER_PROVIDER) break;
      if (isCool(p, model)) continue;
      tries++;
      const r = await tryModel(env, p, model, messages, opts);
      if (r.deltas) return { engine: `${p.name} \xB7 ${model}`, deltas: r.deltas };
      errors.push(r.error || p.name);
    }
    if (!list.length) errors.push(`${p.name}: sin modelos disponibles`);
  }
  if (env.AI) {
    for (const model of WORKERS_MODELS) {
      try {
        const stream = await env.AI.run(model, { messages, max_tokens: opts.maxTokens, temperature: opts.temperature, stream: true });
        return { engine: "Workers AI", deltas: openAiDeltas(stream) };
      } catch (e) {
        errors.push(`Workers AI: ${e.message}`);
      }
    }
  }
  const soonest = [...cooldown.entries()].filter(([, t]) => t - Date.now() < 8e3).sort((a, b) => a[1] - b[1])[0];
  if (soonest) {
    const [name, model] = soonest[0].split("|");
    const p = providers(env).find((x) => x.name === name);
    if (p) {
      await new Promise((r2) => setTimeout(r2, Math.max(0, soonest[1] - Date.now())));
      cooldown.delete(soonest[0]);
      const r = await tryModel(env, p, model, messages, opts);
      if (r.deltas) return { engine: `${p.name} \xB7 ${model}`, deltas: r.deltas };
      errors.push(r.error || name);
    }
  }
  if (errors.length) console.log("IA sin motor disponible: " + errors.join(" | "));
  await noteAiFailure(env, errors.slice(0, 3).join(" | "));
  throw new Error(errors.some((x) => /4006|daily free alloc|429|quota|rate/i.test(x)) ? "cuota agotada" : errors[0] || "No hay motores de IA configurados");
}
__name(llmStream, "llmStream");
async function llmComplete(env, messages, opts) {
  const { deltas } = await llmStream(env, messages, opts);
  let out = "";
  for await (const d of deltas) out += d;
  return out;
}
__name(llmComplete, "llmComplete");
async function groqTranscribe(env, audio, mime, prompt) {
  if (!env.GROQ_API_KEY) return null;
  const ext = /ogg/.test(mime) ? "ogg" : /mp4|m4a|aac/.test(mime) ? "m4a" : /mpeg|mp3/.test(mime) ? "mp3" : /wav/.test(mime) ? "wav" : "webm";
  const auth = { Authorization: `Bearer ${env.GROQ_API_KEY}` };
  const send = /* @__PURE__ */ __name((model2) => {
    const form = new FormData();
    form.append("file", new Blob([audio], { type: mime || "audio/webm" }), `voz.${ext}`);
    form.append("model", model2);
    form.append("language", "es");
    form.append("prompt", prompt.slice(0, 600));
    form.append("response_format", "json");
    return fetch("https://api.groq.com/openai/v1/audio/transcriptions", { method: "POST", headers: auth, body: form });
  }, "send");
  let model = await getSetting2(env, "llm_whisper_groq") || "whisper-large-v3-turbo";
  let res = await send(model);
  if (res.status === 429 && model !== "whisper-large-v3") res = await send("whisper-large-v3");
  if (res.status === 404 || res.status === 400) {
    const list = await fetch("https://api.groq.com/openai/v1/models", { headers: auth }).then((r) => r.json()).catch(() => ({ data: [] }));
    const ids = (list.data || []).map((m) => m.id).filter((id) => /whisper/i.test(id));
    const next = ids.find((id) => /turbo/i.test(id)) || ids[0];
    if (next && next !== model) {
      model = next;
      await putSetting(env, "llm_whisper_groq", model);
      res = await send(model);
    }
  }
  if (!res.ok) {
    console.log(`Groq Whisper ${res.status}: ${(await res.text()).slice(0, 120)}`);
    return null;
  }
  return (await res.json()).text?.trim() || "";
}
__name(groqTranscribe, "groqTranscribe");
async function testEngines(env) {
  const msgs = [{ role: "user", content: "Responde solo con la palabra: listo" }];
  return Promise.all(providers(env).map(async (p) => {
    const t0 = Date.now();
    const list = await candidates(env, p, true);
    if (!list.length) return { engine: p.name, ok: false, ms: Date.now() - t0, detail: "No encontr\xE9 modelos disponibles con esta clave" };
    let last = "";
    for (const model of list.slice(0, MAX_TRIES_PER_PROVIDER)) {
      const r = await tryModel(env, p, model, msgs, { maxTokens: 16, temperature: 0 });
      if (r.deltas) {
        let text = "";
        for await (const d of r.deltas) text += d;
        return { engine: p.name, ok: true, ms: Date.now() - t0, detail: `${model} \xB7 \xAB${text.trim().slice(0, 20)}\xBB \xB7 ${list.length} modelos de respaldo` };
      }
      last = r.error || "";
    }
    return { engine: p.name, ok: false, ms: Date.now() - t0, detail: last.slice(0, 140) };
  }));
}
__name(testEngines, "testEngines");

// src/worker/voice.ts
var MAX_BYTES = 8 * 1024 * 1024;
function toBase64(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 32768) s += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(s);
}
__name(toBase64, "toBase64");
async function transcribeWhatsAppAudio(env, mediaId) {
  if (!env.AI) throw new Error("Workers AI no est\xE1 activado en el Worker.");
  const auth = { Authorization: `Bearer ${env.WA_TOKEN}` };
  const meta = await fetch(`${GRAPH}/${mediaId}`, { headers: auth });
  if (!meta.ok) throw new Error(`WhatsApp no entreg\xF3 el audio (${meta.status}).`);
  const { url, file_size } = await meta.json();
  if (!url) throw new Error("WhatsApp no entreg\xF3 el audio.");
  if (file_size && file_size > MAX_BYTES) throw new Error("El audio es muy largo. Prueba con uno de menos de un minuto.");
  const file = await fetch(url, { headers: auth });
  if (!file.ok) throw new Error(`No pude descargar el audio (${file.status}).`);
  const audio = new Uint8Array(await file.arrayBuffer());
  if (audio.length > MAX_BYTES) throw new Error("El audio es muy largo. Prueba con uno de menos de un minuto.");
  return transcribeAudio(env, audio);
}
__name(transcribeWhatsAppAudio, "transcribeWhatsAppAudio");
async function transcribeAudio(env, audio, mime = "audio/webm") {
  if (audio.length > MAX_BYTES) throw new Error("El audio es muy largo. Prueba con uno de menos de un minuto.");
  const { results } = await env.DB.prepare("SELECT name FROM courses WHERE user_id = ? AND active = 1").bind(env.UID).all();
  const prompt = `Preguntas a Rumbo sobre la universidad UAPA: notas, tareas, foros, pagos, EVA. Asignaturas: ${results.map((r) => r.name).join(", ")}.`;
  const groq = await groqTranscribe(env, audio, mime, prompt).catch(() => null);
  if (groq !== null) return groq;
  if (!env.AI) throw new Error("No hay motor de transcripci\xF3n configurado.");
  const out = await env.AI.run("@cf/openai/whisper-large-v3-turbo", {
    audio: toBase64(audio),
    task: "transcribe",
    language: "es",
    vad_filter: true,
    initial_prompt: prompt
  });
  return (out.text || "").trim();
}
__name(transcribeAudio, "transcribeAudio");

// src/worker/calendar.ts
var esc = /* @__PURE__ */ __name((s) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n"), "esc");
var stamp = /* @__PURE__ */ __name((sec) => new Date(sec * 1e3).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""), "stamp");
var dateOnly = /* @__PURE__ */ __name((sec) => new Date((sec - 4 * 3600) * 1e3).toISOString().slice(0, 10).replace(/-/g, ""), "dateOnly");
function fold(line) {
  const out = [];
  let rest = line;
  while (rest.length > 74) {
    out.push(rest.slice(0, 74));
    rest = " " + rest.slice(74);
  }
  out.push(rest);
  return out.join("\r\n");
}
__name(fold, "fold");
async function calendarIcs(env) {
  const now = nowSec();
  const L = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Rumbo//UAPA//ES",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Rumbo \xB7 UAPA",
    "X-WR-TIMEZONE:America/Santo_Domingo",
    "REFRESH-INTERVAL;VALUE=DURATION:PT2H",
    "X-PUBLISHED-TTL:PT2H"
  ];
  const tasks = (await listTasks(env, { limit: 400 })).filter((t) => t.due_at && t.due_at > now - 60 * 86400);
  for (const t of tasks) {
    const done = t.status === "done";
    const course = t.course_name ? ` (${t.course_short || t.course_name})` : "";
    const desc = [t.course_name, done ? t.notes || "Hecha" : "Pendiente", t.grade !== null && t.grade !== void 0 ? `Nota: ${t.grade}/${t.grade_max}` : "", t.url || ""].filter(Boolean).join("\n");
    L.push(
      "BEGIN:VEVENT",
      `UID:tarea-${t.id}@rumbo`,
      `DTSTAMP:${stamp(now)}`,
      `DTSTART:${stamp(t.due_at - 3600)}`,
      `DTEND:${stamp(t.due_at)}`,
      `SUMMARY:${esc(`${done ? "\u2713 " : "\u{1F4CC} "}${t.title}${course}`)}`,
      `DESCRIPTION:${esc(desc)}`
    );
    if (t.url) L.push(`URL:${t.url}`);
    if (!done) L.push(
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      `DESCRIPTION:${esc("Ma\xF1ana vence: " + t.title)}`,
      "TRIGGER:-P1D",
      "END:VALARM",
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      `DESCRIPTION:${esc("En 3 horas vence: " + t.title)}`,
      "TRIGGER:-PT3H",
      "END:VALARM"
    );
    L.push("END:VEVENT");
  }
  const s = await getSettings(env);
  if (s.ics_study !== "0") {
    const hour = Number(s.study_hour || 19);
    for (const t of tasks.filter((x) => x.status === "pending" && x.due_at > now && x.due_at < now + 14 * 86400)) {
      const d = localDate(env, Math.max(t.due_at - 2 * 86400, now + 86400));
      const start = localToUnix(env, d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), hour, 0);
      if (start + 3600 > t.due_at) continue;
      L.push(
        "BEGIN:VEVENT",
        `UID:estudio-${t.id}@rumbo`,
        `DTSTAMP:${stamp(now)}`,
        `DTSTART:${stamp(start)}`,
        `DTEND:${stamp(start + 3600)}`,
        `SUMMARY:${esc(`\u{1F4DA} Estudiar: ${t.title}`)}`,
        `DESCRIPTION:${esc(`Bloque sugerido por Rumbo. Vence ${t.course_name ? "(" + t.course_name + ") " : ""}el ${new Date(t.due_at * 1e3).toISOString().slice(0, 10)}.`)}`,
        "TRANSP:OPAQUE",
        "BEGIN:VALARM",
        "ACTION:DISPLAY",
        `DESCRIPTION:${esc("Hora de estudiar: " + t.title)}`,
        "TRIGGER:-PT10M",
        "END:VALARM",
        "END:VEVENT"
      );
    }
  }
  const p = await payWindow(env);
  L.push(
    "BEGIN:VEVENT",
    `UID:pago-${p.period}@rumbo`,
    `DTSTAMP:${stamp(now)}`,
    `DTSTART;VALUE=DATE:${dateOnly(p.opensAt)}`,
    `DTEND;VALUE=DATE:${dateOnly(p.closesAt + 86400)}`,
    `SUMMARY:${esc(`\u{1F4B3} Ventana de pago \xB7 cuota de ${periodLabel(p.period)}${p.paid ? " (pagada)" : ""}`)}`,
    "TRANSP:TRANSPARENT",
    "END:VEVENT"
  );
  L.push("END:VCALENDAR");
  return L.map(fold).join("\r\n") + "\r\n";
}
__name(calendarIcs, "calendarIcs");

// src/worker/widget.ts
var WIDGET_VERSION = 4;
var dayKey = /* @__PURE__ */ __name((d) => `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`, "dayKey");
var pick = /* @__PURE__ */ __name((arr, seed) => arr[seed % arr.length], "pick");
var FRASES = [
  "Un chin cada d\xEDa y llegas lejos \u{1F6B6}",
  "El que estudia hoy, gocea ma\xF1ana \u{1F389}",
  "T\xFA no est\xE1s atrasado, vas a tu ritmo \u{1F499}",
  "Toma ag\xFCita y sigue d\xE1ndole \u{1F4A7}",
  "Ese t\xEDtulo viene, tranquilo \u{1F393}",
  "Primero lo dif\xEDcil, despu\xE9s lo sabroso \u{1F60E}",
  "Media hora enfocado vale m\xE1s que tres distra\xEDdo \u23F1\uFE0F",
  "Preg\xFAntale al asistente si te trabas \u{1F916}",
  "Descansar tambi\xE9n es parte del plan \u{1F634}",
  "Lo que empiezas hoy, ma\xF1ana te lo agradeces \u2728",
  "Paso a paso se sube la loma \u26F0\uFE0F",
  "Organ\xEDzate y ganas tiempo para ti \u{1F5D3}\uFE0F"
];
async function streak(env) {
  const { results } = await env.DB.prepare(`SELECT COALESCE(submitted_at, updated_at) AS t FROM tasks WHERE user_id = ? AND status = 'done' AND COALESCE(submitted_at, updated_at) > ?`).bind(env.UID, nowSec() - 120 * 86400).all();
  const days = new Set(results.map((r) => dayKey(localDate(env, r.t))));
  let n = 0;
  let d = localDate(env);
  if (!days.has(dayKey(d))) d = new Date(d.getTime() - 864e5);
  while (days.has(dayKey(d))) {
    n++;
    d = new Date(d.getTime() - 864e5);
  }
  return n;
}
__name(streak, "streak");
async function widgetData(env) {
  const s = await getSettings(env);
  const name = (s.student_name || "").split(" ")[0];
  const now = nowSec();
  const today = localDate(env);
  const endOfToday = now + (86400 - (today.getUTCHours() * 3600 + today.getUTCMinutes() * 60 + today.getUTCSeconds()));
  const pending = (await listTasks(env, { status: "pending", limit: 100 })).filter((t) => t.due_at);
  const overdue = pending.filter((t) => t.due_at < now);
  const dueToday = pending.filter((t) => t.due_at >= now && t.due_at <= endOfToday);
  const soon = pending.filter((t) => t.due_at >= now && t.due_at <= now + 3 * 86400);
  const racha = await streak(env);
  const { results: rem } = await env.DB.prepare("SELECT text, remind_at FROM reminders WHERE user_id = ? AND sent = 0 AND remind_at >= ? ORDER BY remind_at LIMIT 3").bind(env.UID, now - 3600).all();
  const doneWeek = (await env.DB.prepare(`SELECT COUNT(*) AS n FROM tasks WHERE user_id = ? AND status = 'done' AND COALESCE(submitted_at, updated_at) >= ?`).bind(env.UID, now - 7 * 86400).first())?.n || 0;
  const seed = today.getUTCDate() + today.getUTCHours();
  const hi = name ? `, ${name}` : "";
  let mood, headline, sub;
  if (overdue.length) {
    mood = "alerta";
    headline = overdue.length === 1 ? "\xA1Se te pas\xF3 una entrega!" : `\xA1Tienes ${overdue.length} entregas atrasadas!`;
    sub = "Todav\xEDa est\xE1s a tiempo de resolver. Dale ahora.";
  } else if (dueToday.length) {
    mood = "atento";
    headline = dueToday.length === 1 ? `Hoy vence 1 tarea${hi}` : `Hoy vencen ${dueToday.length} tareas${hi}`;
    sub = pick(["Un empujoncito y la sacas \u{1F4AA}", "T\xFA puedes con esto, mano.", "Enf\xF3cate un ratico y listo."], seed);
  } else if (soon.length) {
    mood = "tranqui";
    headline = soon.length === 1 ? "1 entrega en los pr\xF3ximos d\xEDas" : `${soon.length} entregas en los pr\xF3ximos d\xEDas`;
    sub = pick(["Adelanta hoy y vive tranquilo.", "Vas bien, pero no te conf\xEDes \u{1F609}", "Un poquito cada d\xEDa rinde."], seed);
  } else {
    mood = "feliz";
    headline = pick([`Todo al d\xEDa${hi} \u{1F389}`, "\xA1Nada pendiente! \u{1F64C}", `Vas volando${hi} \u{1F680}`], seed);
    sub = racha > 1 ? `Llevas ${racha} d\xEDas seguidos cumpliendo.` : "Aprovecha para adelantar o descansar.";
  }
  const list = [...overdue, ...pending.filter((t) => t.due_at >= now)].slice(0, 3);
  const last = await env.DB.prepare(`SELECT g.item_name, g.grade, g.grade_max FROM grades g WHERE g.user_id = ? AND g.grade IS NOT NULL AND g.updated_at > ? ORDER BY g.updated_at DESC LIMIT 1`).bind(env.UID, now - 5 * 86400).first();
  const gradeLine = last ? `\u{1F4CA} \xDAltima nota: ${Math.round(last.grade * 100) / 100}/${last.grade_max} \xB7 ${last.item_name.replace(/\s+(calificaci[oó]n|foro completo)$/i, "").slice(0, 40)}` : null;
  return {
    mood,
    headline,
    sub,
    streak: racha,
    pending: pending.length,
    today: dueToday.length,
    overdue: overdue.length,
    tasks: list.map((t) => ({ title: t.title, when: t.due_at < now ? "Atrasada" : cuandoTexto(env, t.due_at), course: t.course_short || t.course_name || "", urgent: t.due_at < now + 86400 })),
    reminders: rem.map((r) => ({ text: r.text, when: cuandoTexto(env, r.remind_at) })),
    phrases: gradeLine ? [gradeLine, pick(FRASES, seed * 3), gradeLine] : [0, 1, 2].map((i) => pick(FRASES, seed * 3 + i)),
    lastGrade: last ? { title: last.item_name, grade: last.grade, max: last.grade_max } : null,
    doneWeek,
    updated: horaTexto(today)
  };
}
__name(widgetData, "widgetData");

// src/worker/backup.ts
var KEEP = 8;
var SECRET_SETTING = /token|secret|vapid|private|password|apikey|api_key/i;
var USER_TABLES = ["courses", "tasks", "grades", "announcements", "payments", "pensum", "reminders", "messages", "push_subs"];
async function dumpData(env, onlyMine = false) {
  if (onlyMine) {
    const mine = {};
    for (const t of USER_TABLES) mine[t] = (await env.DB.prepare(`SELECT * FROM ${t} WHERE user_id = ?`).bind(env.UID).all()).results;
    const p = `u${env.UID}:`;
    mine.settings = (await env.DB.prepare("SELECT key, value FROM settings WHERE substr(key, 1, ?) = ?").bind(p.length, p).all()).results.filter((r) => !SECRET_SETTING.test(r.key)).map((r) => ({ key: r.key.slice(p.length), value: r.value }));
    return { version: 1, at: Date.now(), tables: mine };
  }
  const { results: tables } = await env.DB.prepare(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name != 'd1_migrations' ORDER BY name`
  ).all();
  const out = {};
  for (const { name } of tables) {
    const { results } = await env.DB.prepare(`SELECT * FROM "${name.replace(/"/g, "")}"`).all();
    out[name] = name === "settings" ? results.filter((r) => !SECRET_SETTING.test(String(r.key))) : name === "users" ? results.map(({ pass_hash: _h, pass_salt: _s, ...r }) => r) : results;
  }
  return { version: 1, at: Date.now(), tables: out };
}
__name(dumpData, "dumpData");
async function gzip(text) {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Response(stream).arrayBuffer();
}
__name(gzip, "gzip");
async function gunzip(buf) {
  const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).text();
}
__name(gunzip, "gunzip");
async function makeBackup(env) {
  if (!env.BACKUPS) throw new Error("Falta el almacenamiento de copias (BACKUPS)");
  const data = await dumpData(env);
  const rows = Object.values(data.tables).reduce((n, t) => n + t.length, 0);
  const body = await gzip(JSON.stringify(data));
  const key = `backup:${new Date(data.at).toISOString().slice(0, 19).replace(/[:T]/g, "-")}`;
  const info = { key, at: data.at, bytes: body.byteLength, rows };
  await env.BACKUPS.put(key, body, { metadata: info });
  const list = await listBackups(env);
  for (const old of list.slice(KEEP)) await env.BACKUPS.delete(old.key);
  console.log(`Copia de seguridad: ${rows} filas, ${Math.round(body.byteLength / 1024)} KB`);
  return info;
}
__name(makeBackup, "makeBackup");
async function listBackups(env) {
  if (!env.BACKUPS) return [];
  const { keys } = await env.BACKUPS.list({ prefix: "backup:" });
  return keys.map((k) => k.metadata || { key: k.name, at: 0, bytes: 0, rows: 0 }).sort((a, b) => b.at - a.at);
}
__name(listBackups, "listBackups");
async function backupDue(env) {
  if (!env.BACKUPS) return false;
  const [last] = await listBackups(env);
  return !last || Date.now() - last.at >= 7 * 864e5 - 36e5;
}
__name(backupDue, "backupDue");

// src/worker/study.ts
var PROMPTS = {
  plan: `Arma un plan para hacer esta tarea universitaria. Responde SOLO con JSON:
{"steps": [{"title": "verbo + qu\xE9 hacer (m\xE1x 8 palabras)", "detail": "1 o 2 frases concretas", "minutes": n\xFAmero}], "tip": "un consejo corto"}
Entre 3 y 6 pasos, en orden, realistas para un estudiante que trabaja.`,
  tarjetas: `Crea tarjetas de repaso sobre el TEMA de esta tarea (no sobre la entrega). Responde SOLO con JSON:
{"cards": [{"q": "pregunta corta", "a": "respuesta clara de 1 a 3 frases"}]}
Exactamente 6 tarjetas, de lo b\xE1sico a lo m\xE1s dif\xEDcil.`,
  explica: `Explica el tema central de esta tarea para que un estudiante lo entienda r\xE1pido. Responde SOLO con JSON:
{"title": "tema en pocas palabras", "text": "explicaci\xF3n en 2 o 3 p\xE1rrafos cortos, con un ejemplo de la vida diaria en Rep\xFAblica Dominicana", "keys": ["3 a 5 ideas clave cortas"]}`,
  foro: `Ayuda a preparar la participaci\xF3n en este foro universitario. Responde SOLO con JSON:
{"aporte": "borrador del aporte principal: 2 a 4 p\xE1rrafos en primera persona que respondan exactamente lo que pide la consigna", "respuestas": ["3 ideas para responder a compa\xF1eros: c\xF3mo empezar y qu\xE9 aportar, 1 o 2 frases cada una"], "tips": "un consejo corto sobre lo que suele evaluar el facilitador en este foro"}
Escribe natural, como un estudiante dominicano que se expresa bien. No inventes citas, autores ni datos.`
};
function parseJson(raw2) {
  const a = raw2.indexOf("{"), b = raw2.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  try {
    return JSON.parse(raw2.slice(a, b + 1));
  } catch {
    return null;
  }
}
__name(parseJson, "parseJson");
function normalizeStudy(mode, j) {
  if (!j) return null;
  const str = /* @__PURE__ */ __name((x) => String(x ?? "").trim(), "str");
  if (mode === "plan") {
    const steps = (Array.isArray(j.steps) ? j.steps : []).map((s) => ({ title: str(s.title), detail: str(s.detail), minutes: Math.max(5, Math.min(240, Math.round(Number(s.minutes) || 20))) })).filter((s) => s.title).slice(0, 8);
    return steps.length ? { mode, steps, tip: str(j.tip) } : null;
  }
  if (mode === "tarjetas") {
    const cards = (Array.isArray(j.cards) ? j.cards : []).map((c) => ({ q: str(c.q), a: str(c.a) })).filter((c) => c.q && c.a).slice(0, 10);
    return cards.length ? { mode, cards } : null;
  }
  if (mode === "foro") {
    const aporte = str(j.aporte);
    return aporte ? { mode, aporte, respuestas: (Array.isArray(j.respuestas) ? j.respuestas : []).map(str).filter(Boolean).slice(0, 5), tips: str(j.tips) } : null;
  }
  const text = str(j.text);
  return text ? { mode, title: str(j.title), text, keys: (Array.isArray(j.keys) ? j.keys : []).map(str).filter(Boolean).slice(0, 6) } : null;
}
__name(normalizeStudy, "normalizeStudy");
async function study(env, taskId, mode, fresh = false) {
  const [t] = await listTasks(env, { id: taskId, limit: 1 });
  if (!t) throw new Error("Tarea no encontrada");
  if (!fresh) {
    const hit = await env.DB.prepare("SELECT content FROM study_cache WHERE task_id = ? AND mode = ?").bind(taskId, mode).first();
    if (hit) return JSON.parse(hit.content);
  }
  const desc = (t.description || "").slice(0, 3e3);
  const ctx = `Asignatura: ${t.course_name || "Personal"}
Tarea: ${t.title}
${desc ? `Instrucciones del facilitador:
${desc}` : "No hay instrucciones: ded\xFAcelo del t\xEDtulo."}`;
  let result = null;
  for (let attempt = 0; attempt < 2 && !result; attempt++) {
    const raw2 = await llmComplete(env, [
      { role: "system", content: `Eres un tutor universitario dominicano, claro y motivador. Escribe en espa\xF1ol neutro y sencillo. ${PROMPTS[mode]}` },
      { role: "user", content: ctx }
    ], { maxTokens: 1400, temperature: 0.4 });
    result = normalizeStudy(mode, parseJson(raw2));
  }
  if (!result) throw new Error("La IA no devolvi\xF3 un resultado v\xE1lido. Int\xE9ntalo otra vez.");
  await env.DB.prepare(`INSERT INTO study_cache (task_id, mode, content, created_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(task_id, mode) DO UPDATE SET content = excluded.content, created_at = excluded.created_at`).bind(taskId, mode, JSON.stringify(result), nowSec()).run();
  return result;
}
__name(study, "study");

// src/worker/achievements.ts
async function stats(env) {
  const now = nowSec();
  const one = /* @__PURE__ */ __name(async (sql, ...b) => Number((await env.DB.prepare(sql).bind(env.UID, ...b).first())?.n || 0), "one");
  return {
    done: await one(`SELECT COUNT(*) AS n FROM tasks WHERE user_id = ? AND status = 'done'`),
    streak: await streak(env),
    perfect: await one(`SELECT COUNT(*) AS n FROM grades WHERE user_id = ? AND grade IS NOT NULL AND grade_max > 0 AND grade >= grade_max`),
    honorCourses: await one(`SELECT COUNT(*) AS n FROM (SELECT AVG(g.grade * 100.0 / g.grade_max) AS a FROM grades g JOIN courses c ON c.id = g.course_id WHERE g.user_id = ? AND g.grade IS NOT NULL AND g.grade_max > 0 GROUP BY g.course_id HAVING COUNT(*) >= 2 AND a >= 90)`),
    early: await one(`SELECT COUNT(*) AS n FROM tasks WHERE user_id = ? AND status = 'done' AND due_at IS NOT NULL AND submitted_at IS NOT NULL AND submitted_at <= due_at - 86400`),
    weekDone: await one(`SELECT COUNT(*) AS n FROM tasks WHERE user_id = ? AND due_at BETWEEN ? AND ? AND status = 'done'`, now - 7 * 86400, now),
    weekTotal: await one(`SELECT COUNT(*) AS n FROM tasks WHERE user_id = ? AND due_at BETWEEN ? AND ?`, now - 7 * 86400, now),
    chats: await one(`SELECT COUNT(*) AS n FROM messages WHERE user_id = ? AND direction = 'in' AND channel = 'app'`),
    focus: await one(`SELECT COALESCE(SUM(focus_minutes), 0) AS n FROM tasks WHERE user_id = ?`),
    high: await one(`SELECT COUNT(*) AS n FROM grades WHERE user_id = ? AND grade IS NOT NULL AND grade_max > 0 AND grade * 100.0 / grade_max >= 90`)
  };
}
__name(stats, "stats");
function catalog(s) {
  const weekOk = s.weekTotal >= 3 && s.weekDone === s.weekTotal ? 1 : 0;
  return [
    { id: "primera", icon: "\u{1F331}", title: "Primer paso", desc: "Entrega tu primera tarea", goal: 1, value: s.done },
    { id: "entregas10", icon: "\u{1F4DA}", title: "Constante", desc: "Entrega 10 tareas", goal: 10, value: s.done },
    { id: "entregas25", icon: "\u{1F392}", title: "Imparable", desc: "Entrega 25 tareas", goal: 25, value: s.done },
    { id: "entregas50", icon: "\u{1F3C5}", title: "Veterano", desc: "Entrega 50 tareas", goal: 50, value: s.done },
    { id: "entregas100", icon: "\u{1F451}", title: "Leyenda de la UAPA", desc: "Entrega 100 tareas", goal: 100, value: s.done },
    { id: "racha3", icon: "\u{1F525}", title: "En llamas", desc: "3 d\xEDas seguidos cumpliendo", goal: 3, value: s.streak },
    { id: "racha7", icon: "\u26A1", title: "Semana perfecta", desc: "7 d\xEDas seguidos cumpliendo", goal: 7, value: s.streak },
    { id: "racha14", icon: "\u{1F680}", title: "Cohete", desc: "14 d\xEDas seguidos cumpliendo", goal: 14, value: s.streak },
    { id: "perfecta", icon: "\u{1F4AF}", title: "Nota perfecta", desc: "Saca la nota m\xE1xima en una actividad", goal: 1, value: s.perfect },
    { id: "notas10", icon: "\u2B50", title: "Estrella", desc: "10 notas de 90 o m\xE1s", goal: 10, value: s.high },
    { id: "honor", icon: "\u{1F393}", title: "Cuadro de honor", desc: "Promedio de 90+ en una asignatura", goal: 1, value: s.honorCourses },
    { id: "adelantado", icon: "\u23F0", title: "Adelantado", desc: "Entrega 5 tareas con un d\xEDa de anticipaci\xF3n", goal: 5, value: s.early },
    { id: "semana", icon: "\u2705", title: "Todo al d\xEDa", desc: "Cumple todas las entregas de una semana (m\xEDnimo 3)", goal: 1, value: weekOk },
    { id: "enfoque", icon: "\u{1F9D8}", title: "Modo bestia", desc: "2 horas en modo enfoque", goal: 120, value: s.focus },
    { id: "pana", icon: "\u{1F916}", title: "Pana de la IA", desc: "Conversa 10 veces con el asistente", goal: 10, value: s.chats }
  ];
}
__name(catalog, "catalog");
async function achievements(env) {
  const seen = new Set(((await getSettings(env)).achievements_seen || "").split(",").filter(Boolean));
  return catalog(await stats(env)).map((a) => ({ ...a, value: Math.min(a.value, a.goal), unlocked: seen.has(a.id) || a.value >= a.goal }));
}
__name(achievements, "achievements");
async function checkAchievements(env) {
  const s = await getSettings(env);
  const seen = new Set((s.achievements_seen || "").split(",").filter(Boolean));
  const firstRun = !s.achievements_seen;
  const list = await achievements(env);
  const fresh = list.filter((a) => a.unlocked && !seen.has(a.id));
  if (!fresh.length) return [];
  for (const a of fresh) seen.add(a.id);
  await setSetting(env, "achievements_seen", [...seen].join(","));
  if (!firstRun) {
    for (const a of fresh.slice(0, 3)) {
      await sendToMe(env, blocks("\u{1F3C6} *\xA1Logro desbloqueado!*", `${a.icon} *${a.title}*
_${a.desc}_`, "\xA1Sigue as\xED! \u{1F4AA}"), { title: `\u{1F3C6} \xA1Logro desbloqueado! ${a.icon} ${a.title}`, pushBody: a.desc, tag: `logro-${a.id}`, url: "/#inicio" });
    }
  }
  return fresh.map((a) => a.id);
}
__name(checkAchievements, "checkAchievements");

// src/worker/changelog.ts
var CHANGELOG = [
  {
    version: 34,
    date: "2026-10-13",
    title: "\u{1F3A8} Rumbo m\xE1s limpio",
    items: [
      "Inicio m\xE1s claro: tu nombre en grande y el saludo arriba, primero lo que tienes que hacer y al final las metas y los logros.",
      "Avisos ordenados por d\xEDa (Hoy, Ayer, Esta semana). Las notificaciones autom\xE1ticas del EVA (mensajes de foros, entregas confirmadas, inicios de sesi\xF3n) quedan juntas en \xABActividad del EVA\xBB para que no tapen lo importante.",
      "Los n\xFAmeros ahora usan la misma letra de la app y se leen mejor.",
      "Arreglado: el simulador de nota en Notas se ve\xEDa casi transparente, y los botones grandes (como \xABYa la entregu\xE9\xBB) ten\xEDan el \xEDcono desalineado.",
      "Tareas tiene un selector m\xE1s c\xF3modo: Pendientes, Mes, Plan y Entregadas."
    ]
  },
  {
    version: 33,
    date: "2026-10-13",
    title: "\u2728 Rumbo m\xE1s fluido",
    items: [
      "Todo se mueve con f\xEDsica de resorte, como en el iPhone: botones que se hunden al tocarlos y vuelven, interruptores y pesta\xF1as que se acomodan con vida.",
      "Las hojas siguen tu dedo: si las lanzas hacia abajo se cierran a la velocidad del gesto; si no, vuelven a su sitio. Al cerrarlas bajan por el mismo camino por el que subieron.",
      "La pesta\xF1a activa tiene una p\xEDldora que se desliza hasta donde tocas, y las pantallas entran desde el lado hacia el que navegas.",
      "El t\xEDtulo grande se encoge suavemente al bajar, los avisos flotantes entran y salen animados, y las notas nuevas aparecen con un peque\xF1o rebote.",
      "Si en tu tel\xE9fono activaste \xABReducir movimiento\xBB o \xABReducir transparencia\xBB, Rumbo lo respeta."
    ]
  },
  {
    version: 32,
    date: "2026-10-13",
    title: "\u{1F4AC} Foros y entregas desde Rumbo",
    items: [
      "\u{1F4CB} Cada tarea tiene un bot\xF3n \xABCopiar\xBB junto a las instrucciones: copia la asignatura, la fecha y todo lo que pide el facilitador, listo para pegarlo en cualquier IA.",
      "\u{1F4AC} \xABVer el foro y participar\xBB: lees el tema y los mensajes de tus compa\xF1eros, escribes tu aporte o respondes a alguien (con borrador de IA) y lo publicas en el EVA sin salir de Rumbo.",
      "\u{1F4E4} Entrega tus tareas desde el tel\xE9fono: elige los archivos en la ficha y s\xFAbelos al EVA.",
      "\u{1F514} Te aviso cuando te responden en un foro, cuando el facilitador mueve una fecha y cuando publica una tarea nueva.",
      "\u{1F4CA} En Notas: el total oficial del EVA de cada asignatura, la gr\xE1fica de tu promedio en el tiempo y lo que te comentan los facilitadores, con un resumen de IA de qu\xE9 haces bien y qu\xE9 mejorar.",
      "\u{1F9FE} \xABR\xE9cord\xBB: tus notas listas para guardar en PDF o imprimir.",
      "\u{1F3AF} Metas de la semana en Inicio: \xABentregar todo a tiempo\xBB, \xABun d\xEDa antes\xBB o \xABpromedio de 95\xBB, y c\xF3mo vas.",
      "\u{1F5D3}\uFE0F Bloques de estudio en tu calendario (Ajustes \u2192 Calendario), el widget muestra tu \xFAltima nota, las fichas de lo pendiente se guardan para verlas sin internet y puedes guardar la foto del comprobante de cada pago."
    ]
  },
  {
    version: 31,
    date: "2026-10-13",
    title: "\u{1F680} Rumbo m\xE1s r\xE1pido de usar",
    items: [
      "\u270D\uFE0F Pon tu nota a mano: si el EVA no muestra la nota de un foro (o de cualquier entrega), \xE1brela y toca \xABPoner mi nota\xBB. Si despu\xE9s el EVA la publica, se usa la del EVA.",
      "\u23F0 Inicio te dice qu\xE9 hacer ahora: la entrega m\xE1s urgente arriba, con \xABAbrir en el EVA\xBB y \xABYa la entregu\xE9\xBB.",
      "\u{1F389} Cuando te califican, Inicio te muestra la nota grande, el comentario y cu\xE1nto subi\xF3 o baj\xF3 tu promedio.",
      "\u{1F4AC} Foros: la ficha dice si ya pusiste tu aporte y cu\xE1ntas respuestas a compa\xF1eros llevas (\xABRespuestas 1 de 2\xBB). Si el foro cierra pronto y te faltan, te aviso.",
      "\u{1F916} \xABBorrador del foro con IA\xBB: lee la consigna y te prepara tu aporte e ideas para responder a compa\xF1eros.",
      "\u{1F4CA} Promedios con el peso real de cada actividad (cuando el EVA lo publica), tambi\xE9n en el simulador \xAB\xBFCu\xE1nto necesito?\xBB.",
      "\u{1F50E} Buscador en toda la app: toca la lupa de arriba y busca tareas, avisos, asignaturas o facilitadores, sin preocuparte por las tildes.",
      "\u{1F4C5} Nueva vista \xABMes\xBB en Tareas, con un punto de color por cada entrega.",
      "\u{1F4CE} Los archivos que adjunta el facilitador (r\xFAbricas, gu\xEDas) se abren desde la ficha de la tarea.",
      "\u{1F5D3}\uFE0F El plan del domingo ahora trae c\xF3mo te fue en notas esa semana.",
      "Tambi\xE9n: barrita arriba mientras se actualiza el EVA, Notas con filtro \xABSin nota\xBB y orden por nota, tama\xF1o de letra en Ajustes \u2192 Apariencia, y pantallas vac\xEDas con un bot\xF3n para revisar el EVA."
    ]
  },
  {
    version: 30,
    date: "2026-10-13",
    title: "\u{1F4DD} Notas de foros, directo del foro",
    items: [
      "Rumbo ahora entra a tus foros calificables y busca la nota ah\xED mismo: la puntuaci\xF3n de tu mensaje o la respuesta del facilitador (\xABCalificaci\xF3n: 95\xBB). As\xED ves la nota aunque el EVA no la haya pasado al libro de calificaciones.",
      "Arreglado: los foros sal\xEDan \xABsin nota\xBB aunque ya estaban calificados (el EVA trae dos renglones por foro y a veces se tomaba el vac\xEDo). Ahora cada foro sale una sola vez, con su nota.",
      "Los foros donde ya participaste aparecen como entregados, aunque no tengan fecha.",
      "Tocar un foro (en Tareas, en Notas o en el aviso de la nota) abre su ficha con la puntuaci\xF3n y el comentario, igual que las tareas.",
      "Al marcar una tarea como hecha aparece \xABDeshacer\xBB por si te equivocaste.",
      "En Inicio, tocar una asignatura abre directo sus notas, y dice hace cu\xE1nto se revis\xF3 el EVA. Si lleva rato sin revisarse, se pone al d\xEDa solo al abrir la app.",
      "Arreglados los acentos rotos en algunos nombres del EVA (\xABTecnolog\xEDa\xBB)."
    ]
  },
  {
    version: 29,
    date: "2026-10-03",
    title: "Ficha de tarea m\xE1s directa",
    items: [
      "Al abrir una tarea, lo primero es \xABYa la entregu\xE9\xBB y \xABAbrir en el EVA\xBB. Estudiar con IA y el modo enfoque quedan justo debajo, con una l\xEDnea que explica cada uno.",
      "La ficha dice cu\xE1ndo venci\xF3 la tarea y ya no muestra \xABCalificaci\xF3n \u2014\xBB en lo que todav\xEDa no has entregado.",
      "Quien entra por primera vez ve una bienvenida con los pasos para dejar Rumbo listo, en vez de un Inicio vac\xEDo."
    ]
  },
  {
    version: 28,
    date: "2026-10-03",
    title: "Pantallas m\xE1s claras",
    items: [
      "Inicio m\xE1s corto y sin repetir: ya no sale dos veces lo que vence hoy, y si tienes entregas vencidas te lo dice primero.",
      "El pago ahora dice lo que importa: \xAB2 d\xEDas para pagar la cuota\xBB.",
      "Las tareas vencidas dicen cu\xE1ndo vencieron (\xABVenci\xF3 ayer\xBB, \xABhace 3 d\xEDas\xBB) y puedes marcarlas todas de una vez si ya las entregaste.",
      "En Avisos, las novedades de Rumbo ya no tapan los avisos de la UAPA, y los avisos del EVA sin t\xEDtulo muestran su primera l\xEDnea.",
      "En Pagos, la configuraci\xF3n se pliega cuando ya est\xE1 lista.",
      "Las notas de \xAB\xDAltimas calificaciones\xBB quedan alineadas."
    ]
  },
  {
    version: 27,
    date: "2026-10-03",
    title: "Se siente m\xE1s como una app",
    items: [
      'Los botones responden al instante al tocarlos y ya no se quedan "marcados" despu\xE9s de tocarlos.',
      "Dejar presionado un bot\xF3n ya no abre el men\xFA de copiar.",
      "En Android, el teclado ya no tapa el cuadro del asistente.",
      "La barra de arriba del tel\xE9fono combina con el modo claro y el oscuro."
    ]
  },
  {
    version: 26,
    date: "2026-10-02",
    title: "WhatsApp con mejor formato",
    items: [
      "Todos los avisos por WhatsApp tienen ahora el mismo estilo: t\xEDtulo con emoji y negrita, datos en l\xEDneas cortas y f\xE1ciles de leer.",
      "Cada aviso trae al final un enlace que abre justo esa tarea, nota o pantalla en Rumbo.",
      "El resumen del d\xEDa viene por secciones: lo de hoy, lo atrasado, lo que viene, el pago y tu promedio.",
      "Los recordatorios dicen cu\xE1nto falta, las notas muestran el comentario del facilitador como cita y los montos salen como RD$ 6,500.",
      "Las asignaturas salen con su nombre, no con el c\xF3digo del EVA."
    ]
  },
  {
    version: 25,
    date: "2026-10-02",
    title: "\u{1F5D3}\uFE0F Tu plan de la semana por WhatsApp",
    items: [
      "Cada domingo a las 6 p. m. te llega por WhatsApp (y al tel\xE9fono) tu semana organizada: lo que vence cada d\xEDa, el d\xEDa m\xE1s cargado, lo atrasado primero y en qu\xE9 orden hacerlo.",
      "Tambi\xE9n te avisa si esa semana abre o cierra la ventana de pago.",
      "En Ajustes \u2192 Plan de la semana puedes ver c\xF3mo llega, mand\xE1rtelo ahora y cambiar la hora del domingo."
    ]
  },
  {
    version: 24,
    date: "2026-10-02",
    title: "Comentarios y m\xE1s control",
    items: [
      "Ajustes \u2192 Comentarios: cu\xE9ntanos si algo falla o tienes una idea. Le llega al momento a quien administra Rumbo.",
      "Cada compa\xF1ero puede borrar su cuenta y todos sus datos desde Ajustes, cuando quiera.",
      "Tope diario de preguntas al asistente por compa\xF1ero, para que la IA gratis alcance para todos.",
      "Compa\xF1eros muestra qui\xE9n tiene el EVA y el WhatsApp conectados, cu\xE1nto us\xF3 la IA hoy y sus comentarios."
    ]
  },
  {
    version: 23,
    date: "2026-10-02",
    title: "WhatsApp m\xE1s confiable",
    items: [
      "Si CallMeBot est\xE1 saturado, Rumbo reintenta solo y, si aun as\xED no sale, te manda el aviso por WhatsApp en la pr\xF3xima vuelta (m\xE1ximo 30 minutos). Ya no se pierde.",
      "Al activar los avisos, tu clave se guarda aunque CallMeBot est\xE9 ocupado, y te dice claro si la clave no coincide con tu n\xFAmero."
    ]
  },
  {
    version: 22,
    date: "2026-10-02",
    title: "Elige qu\xE9 te llega por WhatsApp",
    items: [
      "En Conexiones eliges qu\xE9 te llega por WhatsApp: resumen, entregas, notas, pagos, avisos o novedades.",
      "No molestar de 10 p. m. a 7 a. m.: en ese horario solo te llega la notificaci\xF3n del tel\xE9fono.",
      "Si CallMeBot no te responde, hay un bot\xF3n para pedir la clave otra vez y te explica qu\xE9 hacer.",
      "Inicio te avisa si te falta conectar algo (EVA, WhatsApp o tu carrera) y te lleva directo a terminarlo.",
      "Pasos m\xE1s claros para conectar el EVA con el enlace, con un bot\xF3n para copiarlo."
    ]
  },
  {
    version: 21,
    date: "2026-10-02",
    title: "\u{1F4AC} Avisos por WhatsApp",
    items: [
      "Ahora el resumen del d\xEDa y todos los avisos de Rumbo (entregas, notas nuevas, pagos, avisos del EVA) tambi\xE9n te llegan por WhatsApp.",
      "Se activa en 2 minutos desde M\xE1s \u2192 Conexiones \u2192 \xABActivar avisos por WhatsApp\xBB, con CallMeBot (gratis). Cada quien pone su propio n\xFAmero.",
      "Antes de guardar, Rumbo te manda un mensaje de prueba para confirmar que llega."
    ]
  },
  {
    version: 20,
    date: "2026-10-02",
    title: "\u{1F465} Rumbo para tus compa\xF1eros",
    items: [
      "Rumbo ahora es multiusuario: invita a tus compa\xF1eros desde M\xE1s \u2192 Compa\xF1eros y m\xE1ndales el enlace por WhatsApp. Cada quien ve solo sus propios datos.",
      "Nueva pantalla Conexiones (M\xE1s \u2192 Conexiones): conecta el EVA, las notificaciones, WhatsApp y tu carrera paso a paso, con un bot\xF3n cada cosa.",
      "El EVA se conecta desde la app con tu matr\xEDcula (la contrase\xF1a no se guarda), sin comandos en la computadora.",
      "Ahora entras con tu matr\xEDcula y puedes cambiar tu contrase\xF1a en Ajustes \u2192 Mi cuenta.",
      "Mejor accesibilidad: m\xE1s contraste en los c\xF3digos de asignatura, los numeritos rojos y el modo oscuro, y botones m\xE1s f\xE1ciles de tocar."
    ]
  },
  {
    version: 19,
    date: "2026-10-01",
    title: "\u{1F389} Rumbo 1.0 ya est\xE1 aqu\xED",
    items: [
      "Estudiar con IA: abre una tarea pendiente y te arma un plan paso a paso, tarjetas para practicar y una explicaci\xF3n que puedes escuchar.",
      "Logros tipo Duolingo en Inicio: 15 medallas por entregas, rachas, notas y m\xE1s. La mascota celebra cada una contigo \u{1F3C6}",
      "Hora de estudio: cada d\xEDa a la hora que elijas (Ajustes) te aviso qu\xE9 te toca estudiar.",
      "\xAB\xBFY si\u2026?\xBB en Notas: mueve la barra y mira con cu\xE1nto terminar\xEDas el trimestre seg\xFAn lo que saques en lo que falta.",
      "M\xE1s seguridad: bloqueo tras 5 intentos fallidos, aviso de cada inicio de sesi\xF3n y \xABCerrar sesi\xF3n en todos los dispositivos\xBB.",
      "Nueva pantalla de Ayuda (M\xE1s \u2192 Ayuda) con buscador y respuestas a las dudas m\xE1s comunes."
    ]
  },
  {
    version: 18,
    date: "2026-10-01",
    title: "M\xE1s r\xE1pida, sin internet y con widget peque\xF1o",
    items: [
      "Funciona sin internet: tus tareas, notas, avisos, pagos y pensum se ven aunque no tengas se\xF1al (te avisa que es lo \xFAltimo guardado).",
      "Abre m\xE1s r\xE1pido y cambiar de pantalla es instant\xE1neo: cada secci\xF3n se prepara en segundo plano.",
      "Nuevo widget peque\xF1o (2\xD72) con la mascota animada, tu racha y lo pr\xF3ximo que vence. Mant\xE9n presionada la pantalla de inicio \u2192 Widgets \u2192 Rumbo.",
      "Bienvenida nueva guiada por la mascota. Puedes verla otra vez en Ajustes \u2192 Ver el recorrido de bienvenida."
    ]
  },
  {
    version: 17,
    date: "2026-10-01",
    title: "Te avisa cuando te califican",
    items: [
      "Cuando el facilitador corrige una tarea te llega un aviso con la nota, un emoji seg\xFAn c\xF3mo te fue y su comentario. Al tocarlo se abre la tarea.",
      "Si te cambian una nota tambi\xE9n te avisa (y te dice cu\xE1nto ten\xEDas antes).",
      "La ficha de cada tarea muestra el comentario del facilitador, y las calificaciones quedan guardadas en Avisos.",
      "Copias de seguridad autom\xE1ticas de tus datos cada semana: Ajustes \u2192 Copias de seguridad (tambi\xE9n puedes descargarlas).",
      "Rumbo te avisa si el EVA deja de conectar, si la IA no responde o si falla una copia."
    ]
  },
  {
    version: 16,
    date: "2026-10-01",
    title: "Rumbo y el widget se actualizan solos",
    items: [
      "La app se actualiza sola: cuando hay versi\xF3n nueva, recarga en un momento tranquilo y te avisa \xABRumbo se actualiz\xF3 \u2728\xBB.",
      "El widget refresca tus datos cada 15 minutos aunque no lo toques.",
      "El widget revisa si hay versi\xF3n nueva: muestra \xABNueva versi\xF3n \xB7 toca para actualizar\xBB y con un toque se instala. Despu\xE9s de la primera vez, en Android 12 o m\xE1s nuevo se actualiza solo.",
      "Esta \xFAltima vez s\xED hay que instalarlo a mano: Ajustes \u2192 Widget \u2192 Descargar."
    ]
  },
  {
    version: 15,
    date: "2026-10-01",
    title: "M\xE1s clara, m\xE1s c\xF3moda y accesible",
    items: [
      "Cada tarea tiene una franja con el color de su asignatura: las distingues de un vistazo.",
      "Las tarjetas responden al tocarlas y los avisos del EVA ya no muestran c\xF3digos raros en el t\xEDtulo.",
      "M\xE1s contraste en textos grises y en las tarjetas de color (Pagos e Inicio): se leen mejor al sol.",
      "Botones m\xE1s f\xE1ciles de tocar, ventanas que se manejan bien con teclado y lector de pantalla, y enlace \xABSaltar al contenido\xBB.",
      "Las novedades de Rumbo en Avisos ahora dicen \xABNovedad de Rumbo\xBB (antes dec\xEDan EVA)."
    ]
  },
  {
    version: 14,
    date: "2026-10-01",
    title: "Widget animado y mascota discreta",
    items: [
      "Widget nuevo: fondo de color seg\xFAn c\xF3mo vas y mascota animada (parpadea, salta y saluda).",
      "El widget rota solo entre tarjetas: c\xF3mo vas, pr\xF3ximas entregas, tus recordatorios, frase del d\xEDa y tu semana.",
      "Para actualizarlo: Ajustes \u2192 Widget \u2192 Descargar e instalar encima (no hace falta conectarlo otra vez).",
      "La mascota de la app ya no estorba: despu\xE9s de saludar se asoma desde el borde y se esconde cuando bajas la pantalla. T\xF3cala para que salga."
    ]
  },
  {
    version: 13,
    date: "2026-10-01",
    title: "Tu mascota te acompa\xF1a (y ya hay widget)",
    items: [
      "Mascota nueva y mucho m\xE1s linda: un estudiante con birrete y br\xFAjula que parpadea, respira y cambia de cara seg\xFAn c\xF3mo vas.",
      "Ahora est\xE1 en todas las pantallas: al cambiar de secci\xF3n cae desde arriba, rebota y te dice algo.",
      "T\xF3cala y reacciona (si la tocas mucho se marea \u{1F635}\u200D\u{1F4AB}). Mantenla presionada para hablar con el asistente.",
      "Widget para tu pantalla de inicio con la mascota, tu racha y lo pr\xF3ximo que vence: Ajustes \u2192 Widget en tu pantalla de inicio.",
      "El asistente ya no dice \xABRespuesta\xBB antes de contestar."
    ]
  },
  {
    version: 12,
    date: "2026-10-01",
    title: "Mascota nueva y una IA que aprende sola",
    items: [
      "Conoce a la mascota de Rumbo: te saluda en Inicio, cambia de cara seg\xFAn c\xF3mo vas y te muestra tu racha \u{1F525}.",
      "El asistente ahora decide solo qu\xE9 datos tuyos vale la pena recordar y ordena su memoria por temas.",
      "Voz todav\xEDa m\xE1s fluida: las frases se encadenan sin silencios y se usa la voz m\xE1s natural de tu tel\xE9fono."
    ]
  },
  {
    version: 11,
    date: "2026-10-01",
    title: "Voz m\xE1s fluida",
    items: [
      "El asistente ya no lee en voz alta los signos (\xABpunto\xBB, \xABcoma\xBB, \xABguion\xBB\u2026).",
      "Habla en frases completas y con menos pausas, como una conversaci\xF3n normal."
    ]
  },
  {
    version: 10,
    date: "2026-10-01",
    title: "Asistente que no se cansa",
    items: [
      "Cada motor de IA ahora tiene varios modelos de respaldo: si uno se satura, Rumbo salta al siguiente en el acto.",
      "Si un modelo responde vac\xEDo o se tarda, se prueba otro sin que lo notes.",
      "En la llamada de voz se env\xEDa menos historial: respuestas m\xE1s r\xE1pidas.",
      "Nuevos motores gratis opcionales: Cerebras y OpenRouter (Ajustes \u2192 Motores de IA)."
    ]
  },
  {
    version: 9,
    date: "2026-10-01",
    title: "La IA elige sola el mejor modelo",
    items: [
      "Rumbo ahora pregunta a Groq, NVIDIA y Gemini qu\xE9 modelos tienen disponibles y usa el mejor autom\xE1ticamente.",
      "Si alg\xFAn proveedor retira un modelo, Rumbo busca otro al instante: el asistente ya no se queda sin responder.",
      "En Ajustes \u2192 Motores de IA, \xABProbar motores\xBB te muestra qu\xE9 modelo est\xE1 usando cada uno."
    ]
  },
  {
    version: 8,
    date: "2026-10-01",
    title: "IA que no se acaba y llamada sin pitidos",
    items: [
      "Rumbo ahora usa varios motores de IA gratis en cadena (Groq, NVIDIA, Gemini y Cloudflare): si uno se agota, sigue el otro.",
      "En la llamada de voz el micr\xF3fono queda abierto en silencio: ya no suena el \xABbip\xBB del tel\xE9fono.",
      "Si pasan 10 segundos sin que hables, la llamada se pone en pausa sola."
    ]
  },
  {
    version: 7,
    date: "2026-10-01",
    title: "Inicio m\xE1s pr\xE1ctico y pantalla m\xE1s limpia",
    items: [
      "Accesos r\xE1pidos en Inicio: hablar con Rumbo, nueva tarea, tu semana y sincronizar.",
      "Cuenta regresiva en vivo de tu pr\xF3xima entrega.",
      "Jala hacia abajo en Inicio y Avisos para traer lo nuevo del EVA.",
      "La barra de abajo se esconde al bajar y vuelve al subir.",
      "En Notas, cada asignatura muestra sus pr\xF3ximas entregas."
    ]
  },
  {
    version: 6,
    date: "2026-10-01",
    title: "Habla con Rumbo como en una llamada",
    items: [
      "Toca el micr\xF3fono: Rumbo te escucha, sabe cu\xE1ndo te callas y te responde en voz alta, sin tocar nada m\xE1s.",
      "Ves tus palabras mientras hablas y la respuesta empieza a sonar desde la primera frase.",
      "Voz m\xE1s natural: la del tel\xE9fono por defecto (gratis e ilimitada) y horas le\xEDdas como se dicen.",
      "Toca la esfera para interrumpirlo; el bot\xF3n rojo termina la llamada."
    ]
  },
  {
    version: 5,
    date: "2026-10-01",
    title: "Rumbo ahora te habla, recuerda todo y responde al instante",
    items: [
      "La respuesta va apareciendo mientras se escribe: ya no esperas a que termine.",
      "Rumbo te contesta con voz de pana joven \u{1F50A} (elige la voz con el engrane del Asistente).",
      "Notas de voz nuevas: pantalla de grabaci\xF3n, puedes volver a escuchar tu audio y ver lo que entendi\xF3.",
      "Memoria permanente: recuerda lo importante que le cuentes (\xABacu\xE9rdate de que\u2026\xBB) y puedes verla o editarla."
    ]
  },
  {
    version: 4,
    date: "2026-10-01",
    title: "Asistente con IA que hace cosas y entiende notas de voz",
    items: [
      'P\xEDdele cosas como le hablas a un pana: "ponme pa\u2019 ma\xF1ana en la tarde el foro de tecno", "mu\xE9vemelo pal viernes", "ya hice la de l\xF3gica".',
      "Crea, mueve, completa y borra tareas; pone recordatorios; registra el pago; sincroniza el EVA y cambia ajustes.",
      "Toca el micr\xF3fono en el Asistente y m\xE1ndale una nota de voz.",
      "Recuerda la conversaci\xF3n y responde con un formato m\xE1s bonito."
    ]
  },
  {
    version: 3,
    date: "2026-10-01",
    title: "Nuevo inicio de sesi\xF3n y ventanas m\xE1s estables",
    items: [
      "Pantalla de entrada redise\xF1ada para el tel\xE9fono.",
      "Arreglo: al tocar una tarea, foro o correo, la ventana de detalle ya no se queda en gris.",
      "Respuesta visual al tocar filas y tarjetas."
    ]
  },
  {
    version: 2,
    date: "2026-10-01",
    title: "Rumbo 2: calendario, enfoque, plan semanal y m\xE1s",
    items: [
      "Pantalla de inicio de sesi\xF3n nueva.",
      "Tus entregas en el calendario del tel\xE9fono (Google Calendar o iPhone).",
      "Instrucciones de cada tarea del EVA dentro de su ficha.",
      "\xCDndice del trimestre y alerta de asignaturas en riesgo.",
      "Historial de trimestres: el pensum marca solo lo aprobado.",
      "Plan de estudio de la semana y modo enfoque (Pomodoro).",
      "Elige qu\xE9 avisos recibir y gu\xEDa para ponerle un sonido propio.",
      "Modo oscuro, pantalla de bienvenida y bot de Telegram."
    ]
  },
  {
    version: 1,
    date: "2026-10-01",
    title: "Asistente con IA, avisos del EVA y correo",
    items: [
      "Asistente con IA gratis que responde con tus datos reales.",
      "Avisos y novedades del EVA, correos de la UAPA reenviados y numeritos rojos."
    ]
  }
];
async function announceRelease(env) {
  const latest = CHANGELOG[0];
  const seen = Number(await getSetting(env, "changelog_seen", "0"));
  if (latest.version <= seen) return;
  await setSetting(env, "changelog_seen", String(latest.version));
  for (const r of CHANGELOG.filter((x) => x.version > seen).slice(0, 2)) {
    const body = r.items.map((i) => `\u2022 ${i}`).join("\n");
    const row = await env.DB.prepare(`INSERT OR IGNORE INTO announcements (user_id, source, ext_id, title, body, author, kind, created_at) VALUES (?, 'rumbo', ?, ?, ?, 'Rumbo', 'novedad', ?) RETURNING id`).bind(env.UID, `v${r.version}`, `\u2728 ${r.title}`, body, nowSec()).first();
    if (r.version === latest.version && row) {
      await sendToMe(env, blocks("\u2728 *Nuevo en Rumbo*", `*${r.title}*`, body), { title: "\u2728 Nuevo en Rumbo", tag: "release", url: `/#avisos/${row.id}`, pushBody: r.title, type: "novedades" });
    }
  }
}
__name(announceRelease, "announceRelease");

// src/worker/pensums.ts
var ISW_2025 = [
  // 1.º
  { term: 1, code: "CBC-103", name: "Orientaci\xF3n a la Educaci\xF3n a Distancia Virtual", credits: 3 },
  { term: 1, code: "CBC-105", name: "Tecnolog\xEDa para el Aprendizaje Virtual", credits: 3 },
  { term: 1, code: "CBE-109", name: "Comunicaci\xF3n Oral y Escrita", credits: 4 },
  { term: 1, code: "CBM-107", name: "Razonamiento L\xF3gico Matem\xE1tico", credits: 4 },
  // 2.º
  { term: 2, code: "FGI-103", name: "L\xF3gica Computacional", credits: 4, prereqs: "CBM-107" },
  { term: 2, code: "CBC-107", name: "Ser Humano y Desarrollo Sostenible", credits: 3 },
  { term: 2, code: "FGI-102", name: "\xC1lgebra y Geometr\xEDa para Ingenieros", credits: 4 },
  { term: 2, code: "ING-103", name: "Ingl\xE9s Comunicativo", credits: 3 },
  // 3.º
  { term: 3, code: "CBE-110", name: "An\xE1lisis y Producci\xF3n de Textos", credits: 4 },
  { term: 3, code: "FGI-104", name: "Programaci\xF3n I", credits: 4, prereqs: "FGI-103" },
  { term: 3, code: "FGM-102", name: "An\xE1lisis Matem\xE1tico I", credits: 5 },
  { term: 3, code: "FGM-205", name: "Matem\xE1tica Discreta", credits: 3 },
  // 4.º
  { term: 4, code: "FGC-105", name: "Metodolog\xEDa de la Investigaci\xF3n Cient\xEDfica", credits: 4 },
  { term: 4, code: "FGI-106", name: "Sistema de Base de Datos", credits: 4 },
  { term: 4, code: "FGI-105", name: "Programaci\xF3n II", credits: 4, prereqs: "FGI-104" },
  { term: 4, code: "FGM-103", name: "An\xE1lisis Matem\xE1tico II", credits: 5, prereqs: "FGM-102" },
  // 5.º
  { term: 5, code: "FGC-203", name: "Filosof\xEDa y Sociedad", credits: 3 },
  { term: 5, code: "ISW-305", name: "Estructura de Datos y Algoritmos", credits: 4 },
  { term: 5, code: "ING-213", name: "Ingl\xE9s T\xE9cnico para Ingenieros", credits: 3, prereqs: "ING-103" },
  { term: 5, code: "FGC-204", name: "Investigaci\xF3n Aplicada", credits: 4, prereqs: "FGC-105" },
  // 6.º
  { term: 6, code: "FGF-201", name: "F\xEDsica General", credits: 4 },
  { term: 6, code: "LAF-201", name: "Pr\xE1ctica de F\xEDsica General", credits: 1, coreqs: "FGF-201" },
  { term: 6, code: "ISW-204", name: "Dise\xF1o de Interfaz de Usuario", credits: 4, prereqs: "FGI-105" },
  { term: 6, code: "ISW-201", name: "Ingenier\xEDa de Software I", credits: 4 },
  // 7.º
  { term: 7, code: "FGC-106", name: "Historia Social Dominicana", credits: 3 },
  { term: 7, code: "ISW-202", name: "Ingenier\xEDa de Software II", credits: 4, prereqs: "ISW-201" },
  { term: 7, code: "ISW-306", name: "Desarrollo de Aplicaciones Web", credits: 4, prereqs: "FGI-105" },
  { term: 7, code: null, name: "Optativa 1", credits: 3, kind: "optativa" },
  // 8.º
  { term: 8, code: "FGM-206", name: "\xC1lgebra Lineal", credits: 4 },
  { term: 8, code: "FGI-209", name: "Electr\xF3nica B\xE1sica", credits: 4, prereqs: "FGF-201" },
  { term: 8, code: "ISW-203", name: "Calidad de Software", credits: 4 },
  { term: 8, code: null, name: "Optativa 2", credits: 3, kind: "optativa" },
  // 9.º
  { term: 9, code: "FGC-208", name: "Educaci\xF3n Constitucional", credits: 3 },
  { term: 9, code: "FGM-314", name: "Matem\xE1tica Num\xE9rica", credits: 4 },
  { term: 9, code: "FGI-210", name: "Arquitectura de Hardware", credits: 4, prereqs: "FGI-209" },
  { term: 9, code: "FGM-207", name: "Estad\xEDstica y Probabilidades", credits: 4 },
  // 10.º
  { term: 10, code: "FGC-409", name: "\xC9tica Profesional", credits: 3 },
  { term: 10, code: "INF-304", name: "Inform\xE1tica Gerencial", credits: 4 },
  { term: 10, code: "ISW-412", name: "Miner\xEDa de Datos", credits: 4, prereqs: "FGM-207" },
  { term: 10, code: null, name: "Optativa 3", credits: 3, kind: "optativa" },
  // 11.º
  { term: 11, code: "FGI-312", name: "Redes y Servicios Telem\xE1ticos", credits: 4 },
  { term: 11, code: "LAT-312", name: "Laboratorio de Redes y Servicios Telem\xE1ticos", credits: 1, coreqs: "FGI-312" },
  { term: 11, code: "ISW-309", name: "Inteligencia Artificial", credits: 4, prereqs: "ISW-412" },
  { term: 11, code: "ISW-310", name: "Sistemas Distribuidos", credits: 4 },
  // 12.º
  { term: 12, code: "COE-101", name: "Contabilidad I", credits: 4 },
  { term: 12, code: "CID-115", name: "Procesamiento del Lenguaje Natural", credits: 4, prereqs: "ISW-309" },
  // El PDF oficial indica "FGI-311", clave que no existe en el pensum; se toma Redes (FGI-312), del trimestre anterior.
  { term: 12, code: "ISW-420", name: "Ciberseguridad", credits: 4, prereqs: "FGI-312" },
  { term: 12, code: "LAS-313", name: "Laboratorio de Ciberseguridad", credits: 1, coreqs: "ISW-420" },
  // 13.º
  { term: 13, code: "INF-408", name: "Investigaci\xF3n de Operaciones", credits: 4 },
  { term: 13, code: "ISW-425", name: "Programaci\xF3n Multiplataforma para Dispositivos M\xF3viles", credits: 4 },
  { term: 13, code: "LAP-425", name: "Laboratorio de Programaci\xF3n Multiplataforma para Dispositivos M\xF3viles", credits: 1, coreqs: "ISW-425" },
  { term: 13, code: "ISW-304", name: "Desarrollo de Proyectos con Software Libre", credits: 4, prereqs: "ISW-306" },
  // 14.º
  { term: 14, code: "ISW-414", name: "Fundamentos de Inteligencia de Negocios", credits: 4 },
  { term: 14, code: "ISW-413", name: "Simulaci\xF3n Digital", credits: 4 },
  { term: 14, code: "ISW-415", name: "Ingenier\xEDa Rob\xF3tica para Software Virtuales I", credits: 4, prereqs: "ISW-304" },
  { term: 14, code: "LAR-415", name: "Laboratorio de Rob\xF3tica para Software Virtuales I", credits: 1, coreqs: "ISW-415" },
  { term: 14, code: "PPS-400", name: "Pr\xE1ctica Profesional (Pasant\xEDa)", credits: 8, prereqs: "ISW-304" },
  // 15.º
  { term: 15, code: "INF-307", name: "Gesti\xF3n del Conocimiento y la Toma de Decisiones", credits: 4 },
  { term: 15, code: "ISW-416", name: "Ingenier\xEDa Rob\xF3tica para Software Virtuales II", credits: 4, prereqs: "ISW-415" },
  { term: 15, code: "LAR-416", name: "Laboratorio de Rob\xF3tica para Software Virtuales II", credits: 1, coreqs: "ISW-416" },
  { term: 15, code: "ISW-417", name: "Seminario de Proyectos de Software", credits: 4 },
  // 16.º
  { term: 16, code: "ISW-400", name: "Curso Final de Grado", credits: 6, prereqs: "TODAS" }
];
var ISW_ELECTIVES = [
  { code: "ISW-431", name: "Blockchain y Aplicaciones Descentralizadas", credits: 3, block: "Propias de la carrera" },
  { code: "ISW-432", name: "Administraci\xF3n de Servidores y Servicios Telem\xE1ticos", credits: 3, block: "Propias de la carrera" },
  { code: "ISW-423", name: "Scrum Master", credits: 3, block: "Propias de la carrera" },
  { code: "ISW-424", name: "Computaci\xF3n Cu\xE1ntica y Algoritmos Avanzados", credits: 3, block: "Propias de la carrera" },
  { code: "FGN-309", name: "Metodolog\xEDas de Emprendimiento", credits: 3, block: "Certificaci\xF3n en Emprendimiento" },
  { code: "ADM-316", name: "Formulaci\xF3n y Creaci\xF3n de Proyectos Emprendedores", credits: 3, block: "Certificaci\xF3n en Emprendimiento" },
  { code: "CON-334", name: "Finanzas B\xE1sicas para Emprendedores", credits: 3, block: "Certificaci\xF3n en Emprendimiento" },
  { code: "FGP-421", name: "Coaching", credits: 3, block: "Certificaci\xF3n en Gesti\xF3n y Liderazgo" },
  { code: "PSG-419", name: "Gesti\xF3n de Conflictos y Mediaci\xF3n", credits: 3, block: "Certificaci\xF3n en Gesti\xF3n y Liderazgo" },
  { code: "ADM-314", name: "Liderazgo y Gesti\xF3n de Equipos", credits: 3, block: "Certificaci\xF3n en Gesti\xF3n y Liderazgo" }
];
var T = "trimestre";
var CAREERS = [
  { id: "isw", name: "Ingenier\xEDa en Software", area: "Ingenier\xEDa y Tecnolog\xEDa", unit: T, pensum: {
    version: "P\xE9nsum vigente desde mayo 2025 (resoluci\xF3n 19-2025)",
    source: "https://www.uapa.edu.do/wp-content/uploads/2022/01/INGENIERIA-EN-SOFTWARE-5.pdf",
    totalCredits: 225,
    items: ISW_2025,
    electives: ISW_ELECTIVES,
    notes: [
      "Servicio Social Universitario de 60 horas (requiere el 6.\xBA trimestre aprobado).",
      "9 cr\xE9ditos de optativas y una certificaci\xF3n en Emprendimiento o en Gesti\xF3n y Liderazgo.",
      "\xCDndice acumulado de 70 o m\xE1s para graduarte, ingl\xE9s B1 antes del Curso Final de Grado y 2 eventos cient\xEDficos."
    ]
  } },
  { id: "cdatos", name: "Ciencia de Datos", area: "Ingenier\xEDa y Tecnolog\xEDa", unit: T },
  { id: "infger", name: "Inform\xE1tica Gerencial", area: "Ingenier\xEDa y Tecnolog\xEDa", unit: T },
  { id: "derecho", name: "Derecho", area: "Ciencias Jur\xEDdicas y Pol\xEDticas", unit: T },
  { id: "adm", name: "Administraci\xF3n de Empresas", area: "Negocios y Turismo", unit: T },
  { id: "admtur", name: "Administraci\xF3n de Empresas Tur\xEDsticas", area: "Negocios y Turismo", unit: T },
  { id: "conta", name: "Contabilidad Empresarial", area: "Negocios y Turismo", unit: T },
  { id: "lenguas", name: "Lenguas Modernas Menci\xF3n Turismo", area: "Negocios y Turismo", unit: T },
  { id: "mercadeo", name: "Mercadeo", area: "Negocios y Turismo", unit: T },
  { id: "enfermeria", name: "Enfermer\xEDa", area: "Ciencias de la Salud y Psicolog\xEDa", unit: T },
  { id: "psico", name: "Psicolog\xEDa", area: "Ciencias de la Salud y Psicolog\xEDa", unit: T },
  { id: "psicocli", name: "Psicolog\xEDa Cl\xEDnica", area: "Ciencias de la Salud y Psicolog\xEDa", unit: T },
  { id: "psicoedu", name: "Psicolog\xEDa Educativa", area: "Ciencias de la Salud y Psicolog\xEDa", unit: T },
  { id: "psicoind", name: "Psicolog\xEDa Industrial", area: "Ciencias de la Salud y Psicolog\xEDa", unit: T },
  { id: "eduart", name: "Educaci\xF3n Art\xEDstica", area: "Educaci\xF3n y Formaci\xF3n General", unit: T },
  { id: "eduini", name: "Educaci\xF3n Inicial", area: "Educaci\xF3n y Formaci\xF3n General", unit: T },
  { id: "edufra", name: "Educaci\xF3n Menci\xF3n Lenguas Extranjeras (Franc\xE9s)", area: "Educaci\xF3n y Formaci\xF3n General", unit: T },
  { id: "eduing", name: "Educaci\xF3n Menci\xF3n Lenguas Extranjeras (Ingl\xE9s)", area: "Educaci\xF3n y Formaci\xF3n General", unit: T },
  { id: "eduprim", name: "Educaci\xF3n Primaria, Primer Ciclo", area: "Educaci\xF3n y Formaci\xF3n General", unit: T },
  { id: "edulen", name: "Educaci\xF3n Secundaria: Lengua Espa\xF1ola y Literatura", area: "Educaci\xF3n y Formaci\xF3n General", unit: T },
  { id: "edumat", name: "Educaci\xF3n Secundaria: Matem\xE1tica y F\xEDsica", area: "Educaci\xF3n y Formaci\xF3n General", unit: T },
  { id: "perio", name: "Periodismo Digital", area: "Ciencias Sociales y Comunicaci\xF3n", unit: T }
];
function findCareer(id) {
  return CAREERS.find((c) => c.id === id);
}
__name(findCareer, "findCareer");

// src/worker/ai.ts
var DIAS2 = ["domingo", "lunes", "martes", "mi\xE9rcoles", "jueves", "viernes", "s\xE1bado"];
var fmt2 = /* @__PURE__ */ __name((n) => String(Math.round(n * 100) / 100), "fmt");
var fold2 = /* @__PURE__ */ __name((s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim(), "fold");
async function buildContext(env, compact = false) {
  const s = await getSettings(env);
  const now = nowSec();
  const L = [];
  const d = localDate(env);
  L.push(`AHORA: ${fechaLarga(d)} ${d.getUTCFullYear()}, ${horaTexto(d)} (hora de Rep\xFAblica Dominicana).`);
  const cal = [];
  for (let i = 0; i < 14; i++) {
    const x = localDate(env, now + i * 86400);
    const iso = `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, "0")}-${String(x.getUTCDate()).padStart(2, "0")}`;
    cal.push(`${DIAS2[x.getUTCDay()]} ${iso}${i === 0 ? " (HOY)" : i === 1 ? " (ma\xF1ana)" : i === 2 ? " (pasado ma\xF1ana)" : ""}`);
  }
  L.push(`CALENDARIO (pr\xF3ximos 14 d\xEDas): ${cal.join(" \xB7 ")}. "El viernes" = el PRIMER viernes de esta lista despu\xE9s de hoy (aunque sea ma\xF1ana).`);
  const career = findCareer(s.career || "");
  L.push(`ESTUDIANTE: ${s.student_name || "el estudiante"}${career ? `, ${career.name} en la UAPA` : ", UAPA"} (la UAPA va por TRIMESTRES).`);
  const courses = await courseSummaries(env);
  if (courses.length) {
    L.push("", "ASIGNATURAS ACTUALES (nombre | c\xF3digo | facilitador | promedio | calificadas/total | pendientes):");
    for (const c of courses) L.push(`- ${c.name} | ${c.code || c.short_name || "-"} | ${c.facilitator || c.facilitator_eva || "desconocido"} | ${c.average ?? "sin notas"} | ${c.graded}/${c.total} | ${c.pending_tasks}`);
  }
  const pending = await listTasks(env, { status: "pending", limit: 40 });
  L.push("", "TAREAS PENDIENTES (#id | t\xEDtulo | asignatura | entrega):");
  if (!pending.length) L.push("- ninguna");
  for (const t of pending) L.push(`- #${t.id} | ${t.title} | ${t.course_name || "Personal"} | ${t.due_at ? (t.due_at < now ? "VENCIDA, " : "") + cuandoTexto(env, t.due_at) : "sin fecha"}`);
  const done = await listTasks(env, { status: "done", limit: compact ? 8 : 40 });
  if (done.length) {
    L.push("", "ENTREGADAS / HECHAS (#id | t\xEDtulo | asignatura | nota):");
    for (const t of done) L.push(`- #${t.id} | ${t.title} | ${t.course_name || "Personal"} | ${t.grade !== null && t.grade !== void 0 ? `${fmt2(t.grade)}/${fmt2(t.grade_max || 100)}` : t.notes === "Plazo cerrado en el EVA" ? "plazo cerrado, sin nota" : "sin calificar"}`);
  }
  const { results: grades } = compact ? { results: [] } : await env.DB.prepare(`SELECT c.name AS course, g.item_name AS item, g.grade, g.grade_max FROM grades g JOIN courses c ON c.id = g.course_id WHERE c.user_id = ? AND c.active = 1 ORDER BY c.name, g.id LIMIT 60`).bind(env.UID).all();
  if (grades.length) {
    L.push("", "LIBRO DE CALIFICACIONES (asignatura | actividad | nota):");
    for (const g of grades) L.push(`- ${g.course} | ${g.item} | ${g.grade === null ? "pendiente" : `${fmt2(g.grade)}/${fmt2(g.grade_max)}`}`);
  }
  const { results: news } = await env.DB.prepare(`SELECT a.title, a.body, a.kind, a.source, a.created_at, a.read, c.name AS course FROM announcements a LEFT JOIN courses c ON c.id = a.course_id
    WHERE a.user_id = ? ORDER BY a.created_at DESC LIMIT ${compact ? 3 : 10}`).bind(env.UID).all();
  if (news.length) {
    L.push("", "AVISOS RECIENTES (fecha | origen | tipo | le\xEDdo | t\xEDtulo: resumen):");
    for (const n of news) L.push(`- ${fechaLarga(localDate(env, n.created_at))} | ${n.course || (n.source === "correo" ? "correo UAPA" : n.source === "rumbo" ? "Rumbo" : "EVA")} | ${n.kind} | ${n.read ? "s\xED" : "no"} | ${n.title}: ${(n.body || "").replace(/\s+/g, " ").slice(0, 200)}`);
  }
  const { results: rem } = await env.DB.prepare("SELECT id, text, remind_at FROM reminders WHERE user_id = ? AND sent = 0 ORDER BY remind_at LIMIT 10").bind(env.UID).all();
  if (rem.length) {
    L.push("", "RECORDATORIOS PROGRAMADOS:");
    for (const r of rem) L.push(`- ${r.text} | ${cuandoTexto(env, r.remind_at)}`);
  }
  const p = await payWindow(env, s);
  L.push("", `PAGO: cuota de ${periodLabel(p.period)}${p.amount ? ` (RD$ ${p.amount})` : ""}: ${p.paid ? "PAGADA" : p.state === "open" ? `ventana ABIERTA, cierra en ${p.daysToClose} d\xEDa(s) (d\xEDa ${p.closeDay})` : `la ventana abre en ${p.daysToOpen} d\xEDa(s) (d\xEDa ${p.openDay})`}.`);
  const { results: pen } = await env.DB.prepare(`SELECT term, code, name, credits, status, grade FROM pensum WHERE user_id = ? ORDER BY term, id`).bind(env.UID).all();
  if (pen.length && !compact) {
    const tot = pen.reduce((a, r) => a + r.credits, 0), ok = pen.filter((r) => r.status === "aprobada").reduce((a, r) => a + r.credits, 0);
    L.push("", `PENSUM: ${ok}/${tot} cr\xE9ditos aprobados. M\xEDnimo para graduarse: \xEDndice 70.`);
    const cur = Math.max(1, ...pen.filter((r) => r.status !== "pendiente").map((r) => r.term));
    for (const r of pen.filter((r2) => r2.status !== "pendiente")) L.push(`- T${r.term} ${r.code || ""} ${r.name} [${r.status}${r.grade ? " " + r.grade : ""}]`);
    L.push(`Pr\xF3ximo trimestre (T${cur + 1}): ${pen.filter((r) => r.term === cur + 1).map((r) => `${r.code || ""} ${r.name}`).join("; ") || "\u2014"}. Faltan ${pen.filter((r) => r.status === "pendiente").length} asignaturas en total.`);
  }
  L.push("", `AJUSTES: resumen diario a las ${s.summary_hour || 7}:00 (${s.summary_enabled === "0" ? "apagado" : "encendido"}); recordatorios ${s.task_reminders || "72,24,3"} h antes; avisos apagados: ${["tareas", "notas", "pagos", "avisos", "resumen", "novedades"].filter((k) => s[`notify_${k}`] === "0").join(", ") || "ninguno"}.`);
  return L.join("\n");
}
__name(buildContext, "buildContext");
var SYSTEM = /* @__PURE__ */ __name((ctx, memory) => `Eres Rumbo, el asistente acad\xE9mico personal (y pana) de un estudiante de la UAPA, Rep\xFAblica Dominicana.

C\xD3MO HABLAS
- Eres un pana joven dominicano: natural, alegre, directo. Usa con naturalidad "klk", "dale", "tranqui", "manito/mano", "tato", "ta' bien", "qu\xE9 lo que", "pa'" (sin exagerar, sin groser\xEDas).
- Entiendes TODO lo coloquial: "klk", "qu\xE9 lo que", "tato", "vaina", "ahorita", "en la tarde", "pa'", "na'", "to'", "manito", "ta' bien", "d\xEDmelo", "tecno" (=Tecnolog\xEDa), "l\xF3gica" (=Razonamiento), errores de dictado de notas de voz, sin tildes, todo en min\xFAscula. Adivina la intenci\xF3n con sentido com\xFAn.
- Usa SOLO los datos del CONTEXTO. Nunca inventes notas, fechas, tareas ni nombres. Si algo no est\xE1, dilo y ofrece sincronizar.

FORMATO (se ve bonito en la app; s\xEDguelo siempre)
- Abre con una l\xEDnea corta y clara. Luego, si hace falta, secciones con t\xEDtulo en su propia l\xEDnea as\xED: *\u{1F4CC} T\xEDtulo*
- Listas con "\u2022 ". Notas siempre como 95/100. Negrita con *un asterisco*.
- Deja una l\xEDnea en blanco entre secciones. M\xE1ximo ~12 l\xEDneas. Nada de tablas ni "#".
- Si das un consejo, ponlo al final en una l\xEDnea que empiece con "\u{1F4A1} ".
- Escribe natural: NUNCA copies el formato interno del contexto ("#12 | t\xEDtulo | \u2026"). Ej.: "\u2022 Resumen de Tecno \xB7 ma\xF1ana 7:00 p. m.". No inventes horarios ni datos que no te dieron.
- SIEMPRE termina con la l\xEDnea === y el JSON (aunque no haya acciones), porque de ah\xED sale tu voz.
- No repitas la lista de acciones: la app ya muestra lo que hiciste.

ACCIONES (puedes hacer cosas de verdad). \xDAsalas SOLO cuando el estudiante lo pida o lo confirme claramente:
- create_task {title, due?: "AAAA-MM-DD HH:MM", course?: nombre o c\xF3digo}  (si no dice hora usa 23:59; "en la tarde"=15:00, "en la noche"=20:00, "en la ma\xF1ana"=09:00)
- complete_task {id}            - reopen_task {id}       (id = n\xFAmero #id del contexto; si no lo sabes, usa {match: "palabras del t\xEDtulo"})
- update_task {id, title?, due?, course?}   (mover fecha, cambiar nombre o asignatura)
- delete_task {id}               (solo si lo pide expl\xEDcitamente)
- add_reminder {text, at: "AAAA-MM-DD HH:MM"}   ("temprano"=07:00)
- update_reminder {match, at, new_text?}   (mover un recordatorio ya creado)
REGLAS: "ponme / an\xF3tame / agr\xE9game / tengo que hacer X para <d\xEDa>" = create_task (es una entrega). "recu\xE9rdame / av\xEDsame" = add_reminder.
Si lo que pide se refiere a algo de los mensajes anteriores ("mu\xE9vemelo", "esa", "la de ahorita"), usa el historial para saber cu\xE1l es.
En "reply" NO afirmes que ya hiciste la acci\xF3n con detalles; di algo corto como "Dale, te lo dejo listo \u{1F447}" \u2014 la app agrega la confirmaci\xF3n real.
- register_payment {amount?}     (cuando dice que pag\xF3 la cuota)
- sync_eva {}                    (traer lo nuevo del EVA)
- mark_news_read {}
- set_setting {key, value}       keys: summary_hour (0-23), summary_enabled (0/1), study_hour (0-23, hora de estudio diaria), study_enabled (0/1), task_reminders ("72,24,3"), student_name, notify_tareas|notify_notas|notify_pagos|notify_avisos|notify_resumen|notify_novedades (0/1)
- set_pensum {code, status: "aprobada"|"en_curso"|"pendiente", grade?}
Usa los #id del contexto. Las fechas, con el CALENDARIO del contexto.

C\xD3MO RESPONDES (formato obligatorio, en este orden):
1) Primero lo que le dices al estudiante, con el FORMATO de arriba. Empieza directo: NUNCA pongas etiquetas como "Respuesta:" o "Pantalla:".
2) Luego una l\xEDnea que diga exactamente: ===
3) Luego UNA l\xEDnea con JSON: {"say": "lo que dir\xEDas en voz alta", "actions": [...], "remember": ["dato duradero", ...]}
   - "say" (sin etiquetas, directo): 1 a 3 frases cortas, como si hablaras por nota de voz con un pana dominicano joven. Sin emojis, sin listas, sin s\xEDmbolos, n\xFAmeros escritos claro ("noventa y dos punto cinco").
   - "remember": T\xDA decides qu\xE9 vale la pena guardar, sin que te lo pidan. Guarda cada dato \xFAtil y duradero que aparezca, aunque lo diga de pasada:
     metas y notas que quiere sacar, materias que le cuestan o le gustan, horarios (trabajo, clases, cu\xE1ndo estudia), facilitadores y compa\xF1eros,
     c\xF3mo quiere que le hables, gustos, situaciones personales que comparti\xF3, fechas importantes, cosas que le funcionaron para estudiar.
     Escribe cada dato corto y concreto en 3\xAA persona ("Trabaja de lunes a viernes hasta las 5 p. m."). Si corrige algo que ya sab\xEDas, guarda la versi\xF3n nueva.
     NO guardes lo que ya est\xE1 en la memoria, ni tareas o recordatorios (eso va en "actions"), ni charla sin importancia. Si no hay nada, [].
Ejemplo:
Dale, te lo dejo listo \u{1F447}
===
{"say": "Klk mano, ya te puse el foro pa' ma\xF1ana en la tarde. Tranqui.", "actions": [{"type": "create_task", "title": "Foro de Tecnolog\xEDa", "due": "2026-10-02 15:00", "course": "Tecnolog\xEDa"}], "remember": []}

MEMORIA DE LARGO PLAZO (lo que sabes del estudiante de conversaciones anteriores; \xFAsalo con naturalidad):
${memory || "(todav\xEDa nada)"}

CONTEXTO:
${ctx}`, "SYSTEM");
function parseLocal(env, v) {
  const m = String(v || "").match(/(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/);
  if (!m) return null;
  return localToUnix(env, +m[1], +m[2], +m[3], m[4] ? +m[4] : 23, m[5] ? +m[5] : 59);
}
__name(parseLocal, "parseLocal");
async function findCourseId(env, name) {
  const q = fold2(String(name || ""));
  if (!q) return null;
  const { results } = await env.DB.prepare("SELECT id, name, code, short_name FROM courses WHERE user_id = ? AND active = 1").bind(env.UID).all();
  const hit = results.find((c) => [c.name, c.code, c.short_name].filter(Boolean).some((x) => {
    const f = fold2(x);
    return f === q || f.includes(q) || q.includes(f);
  })) || results.find((c) => q.split(" ").some((w) => w.length > 3 && fold2(c.name).includes(w)));
  return hit?.id ?? null;
}
__name(findCourseId, "findCourseId");
async function resolveTask(env, a) {
  const n = Number(String(a.id ?? "").replace(/\D/g, ""));
  if (n) {
    const t = await env.DB.prepare("SELECT id, title FROM tasks WHERE id = ? AND user_id = ?").bind(n, env.UID).first();
    if (t) return t;
  }
  const q = fold2([a.match, a.task, a.name, a.type !== "update_task" ? a.title : "", typeof a.id === "string" && /[a-z]/i.test(a.id) ? a.id : ""].filter(Boolean).join(" "));
  if (!q) return null;
  const { results } = await env.DB.prepare(`SELECT id, title, status FROM tasks WHERE user_id = ? ORDER BY status = 'pending' DESC, COALESCE(due_at, 9999999999) LIMIT 300`).bind(env.UID).all();
  const words = q.split(" ").filter((w) => w.length > 2);
  const scored = results.map((t) => ({ t, s: words.filter((w) => fold2(t.title).includes(w) || fold2(t.title).includes(w.slice(0, 5))).length })).filter((x) => x.s > 0).sort((x, y) => y.s - x.s);
  return scored[0]?.t ?? null;
}
__name(resolveTask, "resolveTask");
async function runActions(env, actions) {
  const out = [];
  const now = nowSec();
  for (const a of actions.slice(0, 6)) {
    try {
      switch (a.type) {
        case "create_task": {
          const title = String(a.title || "").trim();
          if (!title) break;
          const due = parseLocal(env, a.due);
          const course = await findCourseId(env, a.course);
          await env.DB.prepare(`INSERT INTO tasks (user_id, title, due_at, course_id, source, status) VALUES (?, ?, ?, ?, 'manual', 'pending')`).bind(env.UID, title, due, course).run();
          out.push(`\u2705 Tarea creada: ${title}${due ? ` \xB7 ${cuandoTexto(env, due)}` : ""}`);
          break;
        }
        case "complete_task":
        case "reopen_task": {
          const done = a.type === "complete_task";
          const t = await resolveTask(env, a);
          if (!t) {
            out.push("\u26A0\uFE0F No encontr\xE9 esa tarea. Dime el nombre como sale en tu lista.");
            break;
          }
          await env.DB.prepare("UPDATE tasks SET status = ?, updated_at = ? WHERE id = ? AND user_id = ?").bind(done ? "done" : "pending", now, t.id, env.UID).run();
          out.push(`\u2705 ${done ? "Marcada como hecha" : "Reabierta"}: ${t.title}`);
          break;
        }
        case "update_task": {
          const t = await resolveTask(env, a);
          if (!t) {
            out.push("\u26A0\uFE0F No encontr\xE9 esa tarea. Dime el nombre como sale en tu lista.");
            break;
          }
          const due = a.due !== void 0 ? parseLocal(env, a.due) : void 0;
          const course = a.course !== void 0 ? await findCourseId(env, a.course) : void 0;
          await env.DB.prepare(`UPDATE tasks SET title = COALESCE(?, title), due_at = CASE WHEN ? THEN ? ELSE due_at END, course_id = CASE WHEN ? THEN ? ELSE course_id END, updated_at = ? WHERE id = ? AND user_id = ?`).bind(a.title ? String(a.title) : null, due !== void 0 ? 1 : 0, due ?? null, course !== void 0 ? 1 : 0, course ?? null, now, t.id, env.UID).run();
          out.push(`\u2705 Tarea actualizada: ${a.title ? String(a.title) : t.title}${due ? ` \xB7 ${cuandoTexto(env, due)}` : ""}`);
          break;
        }
        case "delete_task": {
          const t = await resolveTask(env, a);
          if (!t) {
            out.push("\u26A0\uFE0F No encontr\xE9 esa tarea.");
            break;
          }
          await env.DB.prepare("DELETE FROM tasks WHERE id = ? AND user_id = ?").bind(t.id, env.UID).run();
          out.push(`\u2705 Tarea eliminada: ${t.title}`);
          break;
        }
        case "add_reminder": {
          const at = parseLocal(env, a.at);
          const text = String(a.text || "").trim();
          if (!at || !text) {
            out.push("\u26A0\uFE0F Me falt\xF3 la hora del recordatorio");
            break;
          }
          await env.DB.prepare("INSERT INTO reminders (user_id, text, remind_at) VALUES (?, ?, ?)").bind(env.UID, text, at).run();
          out.push(`\u2705 Recordatorio: ${text} \xB7 ${cuandoTexto(env, at)}`);
          break;
        }
        case "update_reminder": {
          const at = parseLocal(env, a.at);
          const q = fold2(String(a.match || a.text || ""));
          const { results } = await env.DB.prepare("SELECT id, text FROM reminders WHERE user_id = ? AND sent = 0 ORDER BY id DESC").bind(env.UID).all();
          const r = results.find((x) => q && q.split(" ").some((w) => w.length > 3 && fold2(x.text).includes(w))) || results[0];
          if (!r || !at) {
            out.push("\u26A0\uFE0F No encontr\xE9 ese recordatorio");
            break;
          }
          await env.DB.prepare("UPDATE reminders SET remind_at = ?, text = COALESCE(?, text) WHERE id = ?").bind(at, a.new_text ? String(a.new_text) : null, r.id).run();
          out.push(`\u2705 Recordatorio movido: ${a.new_text || r.text} \xB7 ${cuandoTexto(env, at)}`);
          break;
        }
        case "register_payment": {
          const p = await payWindow(env);
          const amount = Number(a.amount) || (p.amount ? Number(p.amount) : null);
          await env.DB.prepare("INSERT INTO payments (user_id, period, amount, paid_at, note) VALUES (?, ?, ?, ?, ?)").bind(env.UID, p.period, amount, now, "Registrado por el asistente").run();
          out.push(`\u2705 Pago registrado: cuota de ${periodLabel(p.period)}${amount ? ` \xB7 RD$ ${amount.toLocaleString("es-DO")}` : ""}`);
          break;
        }
        case "sync_eva": {
          const r = await syncEva(env);
          out.push(`\u2705 EVA sincronizado: ${r.tasksNew} nuevas, ${r.tasksClosed} entregadas`);
          break;
        }
        case "mark_news_read": {
          await env.DB.prepare("UPDATE announcements SET read = 1 WHERE user_id = ? AND read = 0").bind(env.UID).run();
          out.push("\u2705 Avisos marcados como le\xEDdos");
          break;
        }
        case "set_setting": {
          const key = String(a.key || "");
          const allowed = ["summary_hour", "summary_enabled", "study_hour", "study_enabled", "task_reminders", "student_name", "notify_tareas", "notify_notas", "notify_pagos", "notify_avisos", "notify_resumen", "notify_novedades"];
          if (!allowed.includes(key)) {
            out.push(`\u26A0\uFE0F No puedo cambiar \xAB${key}\xBB desde el chat`);
            break;
          }
          await setSetting(env, key, String(a.value ?? ""));
          out.push(`\u2705 Ajuste cambiado: ${key.replace("notify_", "avisos de ").replace("summary_hour", "hora del resumen").replace("summary_enabled", "resumen diario").replace("task_reminders", "recordatorios").replace("student_name", "tu nombre")} \u2192 ${String(a.value)}`);
          break;
        }
        case "remember": {
          await remember(env, String(a.fact || a.text || ""));
          out.push("\u2705 Lo tendr\xE9 presente");
          break;
        }
        case "set_pensum": {
          const code = String(a.code || "").toUpperCase();
          const st = String(a.status || "");
          if (!["aprobada", "en_curso", "pendiente"].includes(st)) break;
          const r = await env.DB.prepare("UPDATE pensum SET status = ?, grade = COALESCE(?, grade) WHERE user_id = ? AND code = ?").bind(st, a.grade !== void 0 ? Number(a.grade) : null, env.UID, code).run();
          out.push(r.meta.changes ? `\u2705 Pensum: ${code} \u2192 ${st.replace("_", " ")}` : `\u26A0\uFE0F No encontr\xE9 ${code} en tu pensum`);
          break;
        }
      }
    } catch (e) {
      out.push(`\u26A0\uFE0F No pude completar \xAB${a.type}\xBB: ${e.message}`);
    }
  }
  return out;
}
__name(runActions, "runActions");
var LABEL = /^\s*(?:\d[).]\s*)?[*_#\s]*(?:respuesta|texto|pantalla|mensaje|reply)(?:\s+(?:para|en)\s+(?:la\s+)?pantalla)?[*_\s]*:\s*[*_]*\s*/i;
function labelLength(text) {
  const m = LABEL.exec(text);
  return m ? m[0].length : 0;
}
__name(labelLength, "labelLength");
function splitOutput(full) {
  const i = full.search(/\n?\s*===\s*\n?/);
  let visible = (i >= 0 ? full.slice(0, i) : full).replace(LABEL, "").trim();
  const meta = i >= 0 ? full.slice(i).replace(/^\s*===\s*/, "") : "";
  let parsed = {};
  const a = meta.indexOf("{"), b = meta.lastIndexOf("}");
  if (a >= 0 && b > a) {
    try {
      parsed = JSON.parse(meta.slice(a, b + 1));
    } catch {
    }
  }
  if (!visible.trim() || visible.trim().startsWith("{")) {
    try {
      const j = JSON.parse(visible.slice(visible.indexOf("{"), visible.lastIndexOf("}") + 1));
      parsed = { ...j, ...parsed };
      visible = j.reply || "";
    } catch {
    }
  }
  const actions = (Array.isArray(parsed.actions) ? parsed.actions : []).map((x) => {
    if (x && typeof x.id === "object" && x.id) {
      const inner = x.id;
      delete x.id;
      return { ...inner, ...x };
    }
    return x;
  });
  visible = visible.replace(/\*\*(.+?)\*\*/g, "*$1*").replace(/^#+\s*/gm, "").trim();
  return { visible, say: String(parsed.say || "").trim(), actions, remember: (Array.isArray(parsed.remember) ? parsed.remember.map(String).join("\n") : String(parsed.remember || "")).trim() };
}
__name(splitOutput, "splitOutput");
async function history(env, channel, limit = 12) {
  const { results } = await env.DB.prepare(`SELECT direction, body FROM messages WHERE user_id = ? AND channel = ? ORDER BY id DESC LIMIT ?`).bind(env.UID, channel, limit).all();
  return results.reverse().map((m) => ({ role: m.direction === "in" ? "user" : "assistant", content: m.body.slice(0, 600) }));
}
__name(history, "history");
async function remember(env, facts) {
  const cur = (await getSettings(env)).ai_memory || "";
  const lines = cur.split("\n").filter(Boolean);
  let added = 0;
  for (const raw2 of facts.split("\n")) {
    const f = raw2.replace(/^[•\-\s]+/, "").trim().replace(/\s+/g, " ").slice(0, 220);
    if (f.length < 4 || fold2(lines.join(" ")).includes(fold2(f).slice(0, 40))) continue;
    lines.push(`\u2022 ${f}`);
    added++;
  }
  if (!added) return;
  console.log(`IA record\xF3 ${added} dato(s)`);
  let text = lines.join("\n");
  if (text.length > 2400) text = await compactMemory(env, text) || lines.slice(-30).join("\n");
  await setSetting(env, "ai_memory", text.slice(0, 3e3));
}
__name(remember, "remember");
async function compactMemory(env, text) {
  try {
    const out = await llmComplete(env, [
      { role: "system", content: 'Reorganiza esta memoria sobre un estudiante. Agrupa por temas con un t\xEDtulo en may\xFAsculas (PERSONAL, ESTUDIOS, HORARIOS, PREFERENCIAS, METAS). Fusiona lo repetido, qu\xE9date con la versi\xF3n m\xE1s reciente si algo cambi\xF3 (lo de abajo es m\xE1s nuevo) y borra lo trivial. Cada dato en una l\xEDnea que empiece con "\u2022 ". M\xE1ximo 1800 caracteres. Responde SOLO con la memoria.' },
      { role: "user", content: text }
    ], { maxTokens: 900, temperature: 0.1 });
    const clean = out.split("===")[0].trim();
    return clean.length > 40 ? clean : null;
  } catch {
    return null;
  }
}
__name(compactMemory, "compactMemory");
var VOICE_MODE = `

MODO LLAMADA DE VOZ (manda sobre el formato de arriba): est\xE1s hablando en voz alta con el estudiante, como en una llamada.
- Antes de "===" escribe SOLO lo que vas a decir: 1 a 3 frases cortas y naturales (m\xE1ximo ~45 palabras). Nada de listas, vi\xF1etas, emojis, asteriscos, t\xEDtulos ni "#".
- Habla como un joven dominicano relajado pero claro. NO escribas "klk", "pa'", "na'" ni abreviaturas (la voz las lee letra por letra): escribe "qu\xE9 lo que", "para", "nada", "tranquilo".
- N\xFAmeros y horas en palabras: "noventa y dos punto cinco", "ma\xF1ana a las siete de la noche". Si hay muchas tareas, menciona las dos m\xE1s urgentes y ofrece m\xE1s.
- Escribe frases completas y fluidas, como se habla: sin par\xE9ntesis, comillas, barras, guiones, dos puntos ni puntos suspensivos.
- Despu\xE9s de "===" el JSON con "actions" y "remember" como siempre ("say" no hace falta).`;
async function preparePrompt(env, question, channel, voice = false) {
  const s = await getSettings(env);
  const past = await history(env, channel, voice ? 6 : 12);
  if (past.length && past[past.length - 1].role === "user" && past[past.length - 1].content === question.slice(0, 600)) past.pop();
  return [{ role: "system", content: SYSTEM(await buildContext(env, voice), s.ai_memory || "") + (voice ? VOICE_MODE : "") }, ...past, { role: "user", content: question.slice(0, 1200) }];
}
__name(preparePrompt, "preparePrompt");
async function finish(env, question, out) {
  const actions = out.actions;
  if (/(ponme|anotame|anótame|agregame|agrégame|apuntame|apúntame|tengo que (hacer|entregar))/i.test(question) && !/recu[eé]rdame|av[ií]same/i.test(question)) {
    for (const x of actions) if (x.type === "add_reminder") {
      x.type = "create_task";
      x.title = x.title || x.text;
      x.due = x.due || x.at;
    }
  }
  if (actions.length) console.log("IA acciones: " + JSON.stringify(actions));
  const done = actions.length ? await runActions(env, actions) : [];
  if (out.remember) await remember(env, out.remember).catch(() => {
  });
  return { text: [out.visible, done.join("\n")].filter(Boolean).join("\n\n"), say: out.say, done };
}
__name(finish, "finish");
async function aiAnswer(env, question, channel = "app") {
  try {
    const messages = await preparePrompt(env, question, channel);
    const raw2 = await llmComplete(env, messages, { maxTokens: 700, temperature: 0.3 });
    const parsed = splitOutput(raw2);
    if (!parsed.visible && !parsed.actions.length) return null;
    return (await finish(env, question, parsed)).text;
  } catch (e) {
    console.log(`IA no respondi\xF3: ${e.message}`);
    return null;
  }
}
__name(aiAnswer, "aiAnswer");
function aiStream(env, question, channel, onDone, opts = {}) {
  const enc3 = new TextEncoder();
  return new ReadableStream({
    async start(ctrl) {
      const send = /* @__PURE__ */ __name((o) => ctrl.enqueue(enc3.encode(`data: ${JSON.stringify(o)}

`)), "send");
      let full = "";
      let shown = 0;
      try {
        if (opts.audio) {
          question = (await transcribeAudio(env, opts.audio, opts.mime)).trim();
          send({ t: "heard", d: question });
          if (!question) {
            send({ t: "done", text: "", say: "", done: [], empty: true });
            ctrl.close();
            return;
          }
          await env.DB.prepare("INSERT INTO messages (user_id, direction, channel, body) VALUES (?, ?, ?, ?)").bind(env.UID, "in", channel, `\u{1F3A4} ${question}`).run();
        }
        const messages = await preparePrompt(env, question, channel, !!opts.voice);
        const { engine, deltas } = await llmStream(env, messages, { maxTokens: opts.voice ? 260 : 700, temperature: 0.4 });
        console.log(`IA: ${engine}`);
        for await (const piece of deltas) {
          full += piece;
          const cut = full.indexOf("===");
          const visibleEnd = cut >= 0 ? cut : Math.max(0, full.length - 4);
          if (!shown && cut < 0 && visibleEnd < 40) continue;
          const lead = shown ? 0 : labelLength(full);
          if (!shown) shown = lead;
          if (visibleEnd > shown && !full.trimStart().startsWith("{")) {
            send({ t: "delta", d: full.slice(shown, visibleEnd) });
            shown = visibleEnd;
          }
        }
        const parsed = splitOutput(full);
        if (!parsed.visible && !parsed.actions.length) throw new Error("La IA no respondi\xF3");
        const fin = await finish(env, question, parsed);
        await onDone(fin.text);
        send({ t: "done", text: fin.text, say: fin.say, done: fin.done });
      } catch (e) {
        const busy = /cuota agotada|4006|daily free alloc|neurons|429|rate/i.test(e.message);
        const fallback = busy ? null : await aiAnswer(env, question, channel).catch(() => null);
        const text = fallback || (opts.voice ? "Dame un chin, se me trab\xF3 la se\xF1al. Rep\xEDteme eso en unos segunditos." : "\u23F3 Se me trab\xF3 la se\xF1al un momentito. Vuelve a enviarlo en unos segundos y te respondo.\n\nMientras tanto funcionan: *hoy*, *tareas*, *notas*, *entregadas*, *pagos* y *sincronizar*.");
        await onDone(text).catch(() => {
        });
        send({ t: "done", text, say: opts.voice ? text : "", done: [] });
      }
      ctrl.close();
    }
  });
}
__name(aiStream, "aiStream");
async function getMemory(env) {
  return (await getSettings(env)).ai_memory || "";
}
__name(getMemory, "getMemory");
async function setMemory(env, text) {
  await setSetting(env, "ai_memory", text.slice(0, 3e3));
}
__name(setMemory, "setMemory");

// src/worker/assistant.ts
var AYUDA = [
  "*Rumbo \xB7 lo que puedo hacer*",
  "\u2022 *hoy*: tu resumen del d\xEDa",
  "\u2022 *tareas*: entregas pendientes",
  "\u2022 *notas*: promedio por asignatura",
  "\u2022 *pagos*: estado de la cuota",
  "\u2022 *pagu\xE9*: registrar el pago de la cuota",
  "\u2022 *listo 12*: marcar la tarea #12 como hecha",
  "\u2022 *nueva* texto ma\xF1ana 18:00: agregar una tarea",
  "\u2022 *recu\xE9rdame* ma\xF1ana 6pm entregar el video",
  "\u2022 *nota de* examen final: buscar la nota de un trabajo",
  "\u2022 *facilitadores*: qui\xE9n da cada asignatura",
  "\u2022 *entregadas*: lo \xFAltimo que entregaste",
  "\u2022 *sincronizar*: traer lo nuevo del EVA",
  "",
  '\u{1F3A4} Tambi\xE9n puedes mandarme una *nota de voz*: "\xBFcu\xE1nto saqu\xE9 en el foro de Tecnolog\xEDa?"'
].join("\n");
function normalize(s) {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
}
__name(normalize, "normalize");
function fold3(s) {
  return [...s].map((ch) => {
    const f = ch.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    return f.length === 1 ? f : ch.toLowerCase().slice(0, 1) || " ";
  }).join("");
}
__name(fold3, "fold");
function parseWhen(env, input) {
  let orig = " " + input.normalize("NFC").replace(/\s/g, " ") + " ";
  let s = fold3(orig);
  const cut = /* @__PURE__ */ __name((m2) => {
    const i = m2.index ?? s.indexOf(m2[0]);
    const blank = " ".repeat(m2[0].length);
    s = s.slice(0, i) + blank + s.slice(i + m2[0].length);
    orig = orig.slice(0, i) + blank + orig.slice(i + m2[0].length);
  }, "cut");
  const now = localDate(env);
  let y = now.getUTCFullYear(), m = now.getUTCMonth() + 1, d = now.getUTCDate();
  let found = false;
  const dias = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];
  const shift = /* @__PURE__ */ __name((n) => {
    const t = new Date(Date.UTC(y, m - 1, d + n));
    y = t.getUTCFullYear();
    m = t.getUTCMonth() + 1;
    d = t.getUTCDate();
  }, "shift");
  let mt;
  if (mt = s.match(/ (?:para )?pasado manana /)) {
    shift(2);
    found = true;
    cut(mt);
  } else if (mt = s.match(/ (?:para )?manana /)) {
    shift(1);
    found = true;
    cut(mt);
  } else if (mt = s.match(/ (?:para )?hoy /)) {
    found = true;
    cut(mt);
  } else if (mt = s.match(/ (?:el |para el )?(\d{4})-(\d{1,2})-(\d{1,2}) /)) {
    y = +mt[1];
    m = +mt[2];
    d = +mt[3];
    found = true;
    cut(mt);
  } else if (mt = s.match(/ (?:el |para el )?(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))? /)) {
    d = +mt[1];
    m = +mt[2];
    if (mt[3]) y = +mt[3] < 100 ? 2e3 + +mt[3] : +mt[3];
    else if (Date.UTC(y, m - 1, d) < Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())) y += 1;
    found = true;
    cut(mt);
  } else {
    for (let i = 0; i < 7; i++) {
      const re = new RegExp(` (?:el |para el |este )?${dias[i]} `);
      if (mt = s.match(re)) {
        let diff = (i - now.getUTCDay() + 7) % 7;
        if (diff === 0) diff = 7;
        shift(diff);
        found = true;
        cut(mt);
        break;
      }
    }
  }
  let h = 8, min = 0, timeFound = false;
  if (mt = s.match(/ (?:a las |a la )?(\d{1,2})(?::(\d{2}))? ?(am|pm|a\.? ?m\.?|p\.? ?m\.?)? /)) {
    const hh = +mt[1];
    if (hh <= 23 && (mt[2] !== void 0 || mt[3] !== void 0 || /a las|a la/.test(mt[0]))) {
      h = hh;
      min = mt[2] ? +mt[2] : 0;
      const suf = (mt[3] || "").replace(/[\s.]/g, "");
      if (suf === "pm" && h < 12) h += 12;
      if (suf === "am" && h === 12) h = 0;
      timeFound = true;
      cut(mt);
    }
  }
  if (!found && !timeFound) return null;
  let at = localToUnix(env, y, m, d, h, min);
  if (!found && at < nowSec()) at += 86400;
  return { at, rest: orig.replace(/\s+/g, " ").trim() };
}
__name(parseWhen, "parseWhen");
async function tareasTexto(env) {
  const now = nowSec();
  const tasks = await listTasks(env, { status: "pending", from: now - 3 * 86400, limit: 30 });
  if (!tasks.length) return "No tienes tareas pendientes.";
  const lines = ["*Tareas pendientes:*"];
  for (const t of tasks) {
    const when = t.due_at ? t.due_at < now ? "vencida" : cuandoTexto(env, t.due_at) : "sin fecha";
    lines.push(`#${t.id} \xB7 ${t.title}${t.course_short ? " (" + t.course_short + ")" : ""} \xB7 ${when}`);
  }
  lines.push("", 'Responde "listo #" cuando termines una.');
  return lines.join("\n");
}
__name(tareasTexto, "tareasTexto");
async function notasTexto(env) {
  const courses = await courseSummaries(env);
  if (!courses.length) return 'A\xFAn no hay asignaturas. Escribe "sincronizar" para traerlas del EVA.';
  const lines = ["*Notas por asignatura:*"];
  for (const c of courses) lines.push(`\u2022 ${c.name}: ${c.average ?? "sin notas"}${c.total ? ` (${c.graded}/${c.total} actividades)` : ""}`);
  const avg = overallAverage(courses);
  if (avg !== null) lines.push("", `Promedio general de actividades: *${avg}*`);
  return lines.join("\n");
}
__name(notasTexto, "notasTexto");
var STOP = new Set("a al como con cual cuales cuanto cuanta de del dime dame el en es esta este fue hola la las lo los me mi mis por para porfa favor que quiero saber se sobre su tengo tuve un una y ya oye rumbo saque saco obtuve puse saber decir nota notas calificacion calificaciones puntuacion puntos puntaje sacaste mire ver".split(" "));
function keywords(q) {
  return normalize(q.replace(/[¿?¡!.,;:"'«»()]/g, " ")).split(" ").filter((t) => t && !STOP.has(t) && (t.length > 1 || /\d/.test(t)));
}
__name(keywords, "keywords");
async function notaBuscarTexto(env, query) {
  const limpio = query.trim();
  const qTokens = keywords(limpio);
  if (!qTokens.length) return notasTexto(env);
  const all = await allGrades(env);
  if (!all.length) return 'A\xFAn no tengo notas guardadas. Escribe "sincronizar" o agr\xE9galas en la app.';
  const hit = /* @__PURE__ */ __name((hay, t) => hay.includes(t) || t.length > 4 && t.endsWith("s") && hay.includes(t.slice(0, -1)), "hit");
  const scored = all.map((g) => {
    const hay = normalize(`${g.item} ${g.course}`);
    return { g, score: qTokens.filter((t) => hit(hay, t)).length };
  }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score || b.g.updated_at - a.g.updated_at);
  if (!scored.length) return `No encontr\xE9 ninguna actividad que coincida con "${limpio}". Escribe "notas" para ver el resumen por asignatura.`;
  const top = scored[0].score;
  const best = scored.filter((x) => x.score === top).slice(0, 6);
  const lines = best.length > 1 ? ["Encontr\xE9 varias coincidencias:"] : [];
  for (const { g } of best) {
    const val = g.grade === null ? "sin calificar todav\xEDa" : `*${g.grade}* de ${g.grade_max}`;
    lines.push(`${g.item} (${g.course}): ${val}`);
  }
  return lines.join("\n");
}
__name(notaBuscarTexto, "notaBuscarTexto");
async function facilitadoresTexto(env, query) {
  const courses = await courseSummaries(env);
  if (!courses.length) return 'A\xFAn no tengo tus asignaturas. Escribe "sincronizar" para traerlas del EVA.';
  const who = /* @__PURE__ */ __name((c) => c.facilitator || c.facilitator_eva, "who");
  const qTokens = keywords(query).filter((t) => !/^(facilitador|facilitadora|facilitadores|profesor|profesora|profesores|maestro|maestra|docente|tutor|tutora|quien|quienes|asignatura|materia|clase|son|mis)$/.test(t));
  const scored = courses.map((c) => ({ c, score: qTokens.filter((t) => normalize(`${c.name} ${c.short_name || ""} ${c.code || ""}`).includes(t)).length })).sort((a, b) => b.score - a.score);
  if (qTokens.length && scored[0].score > 0) {
    const c = scored[0].c;
    return who(c) ? `Tu facilitador/a de *${c.name}* es *${who(c)}*.` : `El EVA no publica el facilitador de *${c.name}*. Puedes escribirlo en la app (Notas \u2192 la asignatura).`;
  }
  const lines = ["*Tus facilitadores:*"];
  for (const c of courses) lines.push(`\u2022 ${c.name}: ${who(c) || "no aparece en el EVA"}`);
  return lines.join("\n");
}
__name(facilitadoresTexto, "facilitadoresTexto");
async function entregadasTexto(env) {
  const done = await listTasks(env, { status: "done", limit: 12 });
  if (!done.length) return 'Todav\xEDa no tengo tareas entregadas. Escribe "sincronizar" para revisar el EVA.';
  const lines = ["*\xDAltimas tareas entregadas o cerradas:*"];
  for (const t of done) lines.push(`\u2713 ${t.title}${t.course_short ? " (" + t.course_short + ")" : ""}${t.grade !== null ? ` \xB7 *${Math.round(t.grade * 100) / 100}/${t.grade_max}*` : t.notes === "Plazo cerrado en el EVA" ? " \xB7 plazo cerrado" : " \xB7 sin calificar"}`);
  return lines.join("\n");
}
__name(entregadasTexto, "entregadasTexto");
async function pagosTexto(env) {
  const p = await payWindow(env);
  const cierre = fechaCorta(localDate(env, p.closesAt));
  const apertura = fechaCorta(localDate(env, p.opensAt));
  if (p.paid) return `La cuota de ${periodLabel(p.period)} ya est\xE1 pagada.`;
  if (p.state === "open") return `La ventana de pago est\xE1 *abierta*. Cierra el ${cierre} (faltan ${p.daysToClose} d\xEDas)${p.amount ? ". Monto: RD$ " + p.amount : ""}.
Cuando pagues, responde "pagu\xE9".`;
  return `La pr\xF3xima ventana de pago abre el ${apertura} (en ${p.daysToOpen} d\xEDas) y cierra el ${cierre}.`;
}
__name(pagosTexto, "pagosTexto");
async function handleCommand(env, input, channel = "app", opts = {}) {
  const raw2 = input.replace(/^[\s¿¡"«]+|[\s?!.»"]+$/g, "");
  const text = normalize(raw2.replace(/[¿?¡!,;"«»]/g, " "));
  const now = nowSec();
  if (!text || /^(hola|menu|ayuda|help|\?|comandos)$/.test(text)) return AYUDA;
  if (/^(hoy|resumen|dia)$/.test(text)) return summaryText(env);
  if (/^(tareas?|pendientes?)$/.test(text)) return tareasTexto(env);
  if (/^(notas?|calificaciones|promedio)$/.test(text)) return notasTexto(env);
  if (/^(facilitador(es|a)?|profesor(es|a)?|docentes?)$/.test(text)) return facilitadoresTexto(env, "");
  if (/^(entregadas?|hechas?|historial)$/.test(text)) return entregadasTexto(env);
  if (/^(pagos?|cuota)$/.test(text)) return pagosTexto(env);
  let mtNota;
  if (mtNota = raw2.match(/^\s*(?:nota|notas|calificaci[oó]n|calificaciones)\s+(?:de|del|en|de la)\s+(.+)$/i)) {
    return notaBuscarTexto(env, mtNota[1]);
  }
  if (mtNota = text.match(/^(?:cuanto|cual|que)\s+(?:saque|tengo|obtuve|me puse|saco)\s+(?:en|de)\s+(.+)$/)) {
    return notaBuscarTexto(env, mtNota[1]);
  }
  if (/^(ya )?pague\b/.test(text)) {
    const p = await payWindow(env);
    const monto = text.match(/(\d[\d,.]*)/);
    await env.DB.prepare("INSERT INTO payments (user_id, period, amount, paid_at, note) VALUES (?, ?, ?, ?, ?)").bind(env.UID, p.period, monto ? Number(monto[1].replace(/,/g, "")) : p.amount ? Number(p.amount) : null, now, "Registrado por WhatsApp").run();
    return `Listo. Registr\xE9 el pago de la cuota de ${periodLabel(p.period)}. No te enviar\xE9 m\xE1s avisos de este mes.`;
  }
  let mt;
  if (mt = text.match(/^(listo|lista|hecha|hecho|entregada|entregado|terminada|terminado)\s*#?(\d+)$/)) {
    const id = Number(mt[2]);
    const r = await env.DB.prepare(`UPDATE tasks SET status = 'done', updated_at = ? WHERE id = ? AND user_id = ? AND status = 'pending'`).bind(now, id, env.UID).run();
    if (!r.meta.changes) return `No encontr\xE9 una tarea pendiente con el n\xFAmero #${id}. Escribe "tareas" para ver la lista.`;
    const t = await env.DB.prepare("SELECT title FROM tasks WHERE id = ? AND user_id = ?").bind(id, env.UID).first();
    return `Hecho. Marqu\xE9 "${t?.title}" como terminada.`;
  }
  if (!env.AI && (mt = raw2.match(/^\s*(nueva|nueva tarea|agregar|anotar)\s+(.+)$/i))) {
    const when = parseWhen(env, mt[2]);
    const title = when ? when.rest : mt[2].trim();
    const r = await env.DB.prepare(`INSERT INTO tasks (user_id, title, due_at, source, status) VALUES (?, ?, ?, 'manual', 'pending') RETURNING id`).bind(env.UID, capitalize(title), when?.at ?? null).first();
    return `Agregu\xE9 la tarea #${r?.id}: "${capitalize(title)}"${when ? " (" + cuandoTexto(env, when.at) + ")" : ""}.`;
  }
  if (!env.AI && (mt = raw2.match(/^\s*(recu[eé]rdame|recordar|recordarme|recordatorio)\s+(.+)$/i))) {
    const when = parseWhen(env, mt[2]);
    if (!when) return 'Dime cu\xE1ndo. Por ejemplo: "recu\xE9rdame ma\xF1ana 6pm entregar el video".';
    const what = when.rest.replace(/^(que |de )/i, "") || "tu recordatorio";
    await env.DB.prepare("INSERT INTO reminders (user_id, text, remind_at) VALUES (?, ?, ?)").bind(env.UID, capitalize(what), when.at).run();
    const d = localDate(env, when.at);
    return `Listo. Te recordar\xE9 "${capitalize(what)}" el ${fechaCorta(d)}, ${horaTexto(d)}`;
  }
  if (/^(sincronizar|sync|actualizar)$/.test(text)) {
    try {
      const r = await syncEva(env);
      return `Sincronic\xE9 el EVA: ${r.courses} asignaturas, ${r.tasksNew} tareas nuevas, ${r.tasksUpdated} actualizadas, ${r.tasksClosed} entregadas.`;
    } catch (e) {
      return `No pude conectar con el EVA: ${e.message}`;
    }
  }
  if (opts.noAi && env.AI) return "";
  const ai = await aiAnswer(env, raw2, channel).catch(() => null);
  if (ai) return ai;
  if (/\b(facilitador|facilitadora|facilitadores|profesor|profesora|profesores|maestro|maestra|docente|tutor|tutora)\b/.test(text)) return facilitadoresTexto(env, raw2);
  if (/\b(entregue|entregadas|entregados|entregada|ya hice|hechas|terminadas|complete)\b/.test(text)) return entregadasTexto(env);
  if (/\b(nota|notas|calificacion|calificaciones|saque|saco|obtuve|me puse|puntuacion|puntaje|puntos)\b/.test(text)) return notaBuscarTexto(env, raw2);
  if (/\b(pago|pagos|pagar|cuota|mensualidad)\b/.test(text)) return pagosTexto(env);
  if (/\b(tarea|tareas|pendiente|pendientes|entregar|entrega|entregas|vence|vencen|deberes)\b/.test(text)) return tareasTexto(env);
  if (/\b(resumen|hoy|mi dia)\b/.test(text)) return summaryText(env);
  return `No entend\xED "${raw2.trim().slice(0, 60)}".

${AYUDA}`;
}
__name(handleCommand, "handleCommand");
function capitalize(s) {
  const t = s.trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}
__name(capitalize, "capitalize");

// src/worker/plan.ts
var DIAS3 = ["Domingo", "Lunes", "Martes", "Mi\xE9rcoles", "Jueves", "Viernes", "S\xE1bado"];
function weekRange(env, now = nowSec()) {
  const d = localDate(env, now);
  const dow = d.getUTCDay();
  const daysToSunday = dow === 0 ? 7 : 7 - dow;
  const end = new Date(d.getTime() + daysToSunday * 864e5);
  const start = dow === 0 ? new Date(d.getTime() + 864e5) : d;
  const to = localToUnix(env, end.getUTCFullYear(), end.getUTCMonth() + 1, end.getUTCDate(), 23, 59);
  const label = `${start.getUTCDate()}${start.getUTCMonth() !== end.getUTCMonth() ? " " + MESES_CORTO[start.getUTCMonth()] : ""}\u2013${end.getUTCDate()} ${MESES_CORTO[end.getUTCMonth()]}`;
  return { from: now, to, label };
}
__name(weekRange, "weekRange");
async function weeklyPlan(env) {
  const s = await getSettings(env);
  const now = nowSec();
  const { to, label } = weekRange(env, now);
  const pending = await listTasks(env, { status: "pending", limit: 200 });
  const overdue = pending.filter((t) => t.due_at !== null && t.due_at < now && t.due_at > now - 7 * 86400);
  const week = pending.filter((t) => t.due_at !== null && t.due_at >= now && t.due_at <= to).sort((a, b) => a.due_at - b.due_at);
  const name = (s.student_name || "").split(" ")[0];
  const L = [`\u{1F5D3}\uFE0F *Tu plan de la semana${name ? ", " + name : ""}*`, `_${label}_`];
  const curso = /* @__PURE__ */ __name((t) => {
    const c = courseLabel(t.course_name, t.course_short);
    return c ? ` _(${c})_` : "";
  }, "curso");
  if (!week.length && !overdue.length) {
    L.push("", "No tienes entregas esta semana \u{1F389}. Buen momento para adelantar lecturas o repasar.");
  } else {
    const byDay = /* @__PURE__ */ new Map();
    for (const t of week) {
      const d = localDate(env, t.due_at);
      const k = `${DIAS3[d.getUTCDay()]} ${d.getUTCDate()}`;
      byDay.set(k, [...byDay.get(k) || [], t]);
    }
    const heavy = [...byDay].sort((a, b) => b[1].length - a[1].length)[0];
    L.push("", `\u{1F4DA} *${week.length} entrega${week.length === 1 ? "" : "s"}*${heavy && heavy[1].length > 1 ? ` \xB7 el d\xEDa m\xE1s cargado es el ${heavy[0].toLowerCase()} (${heavy[1].length})` : ""}`);
    if (overdue.length) {
      L.push("", "\u26A0\uFE0F *Primero, lo atrasado*");
      for (const t of overdue.slice(0, 4)) L.push(`\u2022 ${t.title}${curso(t)}`);
    }
    for (const [day, list] of byDay) {
      L.push("", `\u{1F4CD} *${day}*`);
      for (const t of list) L.push(`\u2022 ${t.title}${curso(t)} \xB7 ${horaTexto(localDate(env, t.due_at))}`);
    }
    const today = ymd(localDate(env, now)), tomorrow = ymd(localDate(env, now + 86400));
    const starts = week.slice(0, 5).map((t) => {
      const earliest = t.due_at - now > 36 * 3600 ? now + 86400 : now;
      const day = ymd(localDate(env, Math.max(t.due_at - 2 * 86400, earliest)));
      return { t, when: day === today ? "hoy" : day === tomorrow ? "ma\xF1ana" : fechaCorta(localDate(env, t.due_at - 2 * 86400)) };
    });
    L.push("", "\u2705 *Orden sugerido*");
    starts.forEach(({ t, when }, i) => L.push(`${i + 1}. ${t.title} \u2192 _${when === "hoy" ? "hazla hoy" : "empieza " + when}_`));
  }
  const { results: notas } = await env.DB.prepare(`SELECT g.grade, g.grade_max FROM grades g WHERE g.user_id = ? AND g.grade IS NOT NULL AND g.grade_max > 0 AND g.updated_at > ?`).bind(env.UID, now - 7 * 86400).all();
  if (notas.length) {
    const avg = notas.reduce((a, n) => a + n.grade / n.grade_max * 100, 0) / notas.length;
    L.push("", `\u{1F4CA} *Notas de la semana:* te calificaron ${notas.length} actividad${notas.length === 1 ? "" : "es"} \xB7 promedio *${Math.round(avg * 10) / 10}* ${avg >= 90 ? "\u{1F3C5}" : avg >= 70 ? "\u2705" : "\u26A0\uFE0F"}`);
  }
  const p = await payWindow(env, s);
  if (!p.paid && p.state === "open" && p.closesAt <= to) L.push("", `\u{1F4B3} La ventana de pago de ${periodLabel(p.period)} cierra el ${fechaCorta(localDate(env, p.closesAt))}.`);
  else if (!p.paid && p.state === "closed" && p.opensAt <= to) L.push("", `\u{1F4B3} La ventana de pago abre el ${fechaCorta(localDate(env, p.opensAt))}.`);
  const short = week.length ? `${week.length} entrega${week.length === 1 ? "" : "s"}${overdue.length ? ` y ${overdue.length} atrasada${overdue.length === 1 ? "" : "s"}` : ""}. Empieza por: ${week[0].title}` : overdue.length ? `${overdue.length} atrasada${overdue.length === 1 ? "" : "s"} por resolver` : "Semana libre \u{1F389}";
  return { text: L.join("\n"), short, count: week.length };
}
__name(weeklyPlan, "weeklyPlan");

// src/worker/extras.ts
async function evaCan(env) {
  try {
    return { forumPost: false, submit: false, submitGrading: false, status: false, ...JSON.parse(await getSetting(env, "eva_can", "{}")) };
  } catch {
    return { forumPost: false, submit: false, submitGrading: false, status: false };
  }
}
__name(evaCan, "evaCan");
async function ownTask(env, id) {
  return env.DB.prepare("SELECT id, title, moodle_key, course_id, url FROM tasks WHERE id = ? AND user_id = ?").bind(id, env.UID).first();
}
__name(ownTask, "ownTask");
var esc2 = /* @__PURE__ */ __name((s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"), "esc");
var toForumHtml = /* @__PURE__ */ __name((text) => text.trim().split(/\n{2,}/).map((p) => `<p>${esc2(p).replace(/\n/g, "<br>")}</p>`).join(""), "toForumHtml");
async function recordAverage(env) {
  const avg = overallAverage(await courseSummaries(env));
  if (avg === null) return;
  const hist = JSON.parse(await getSetting(env, "avg_history", "[]"));
  const d = ymd(localDate(env));
  const last = hist[hist.length - 1];
  if (last?.d === d) last.a = avg;
  else hist.push({ d, a: avg });
  await setSetting(env, "avg_history", JSON.stringify(hist.slice(-365)));
}
__name(recordAverage, "recordAverage");
function registerExtras(app2) {
  app2.get("/api/eva/can", async (c) => c.json(await evaCan(c.env)));
  app2.get("/api/tasks/:id/forum", async (c) => {
    const t = await ownTask(c.env, Number(c.req.param("id")));
    if (!t?.moodle_key?.startsWith("forum:")) return c.json({ error: "Esta tarea no es un foro." }, 400);
    const forumId = Number(t.moodle_key.split(":")[1]);
    const site = await moodleCall(c.env, "core_webservice_get_site_info");
    const discs = (await moodleCall(c.env, "mod_forum_get_forum_discussions", { forumid: forumId, sortorder: -1, page: 0, perpage: 20 })).discussions || [];
    const out = [];
    for (const d of discs.slice(0, 3)) {
      const did = d.discussion ?? d.id;
      const r = await moodleCall(c.env, "mod_forum_get_discussion_posts", { discussionid: did, sortby: "created", sortdirection: "ASC" });
      const posts = (r.posts || []).map((p) => ({ id: p.id, parent: p.parentid || 0, author: p.author?.fullname || "Alguien", mine: p.author?.id === site.userid, text: htmlToText(p.message).slice(0, 3e3), created: p.timecreated || 0, subject: p.subject || "" }));
      const mineIds = new Set(posts.filter((p) => p.mine).map((p) => p.id));
      const root = posts.find((p) => !p.parent) || posts[0];
      const keep = /* @__PURE__ */ new Set([root?.id, ...posts.filter((p) => p.mine || mineIds.has(p.parent)).map((p) => p.id), ...posts.filter((p) => !p.mine).slice(-40).map((p) => p.id)]);
      out.push({
        id: did,
        name: d.name || root?.subject || "Discusi\xF3n",
        rootId: root?.id ?? null,
        total: posts.length,
        posts: posts.filter((p) => keep.has(p.id)).map((p) => ({ ...p, toMe: mineIds.has(p.parent) && !p.mine }))
      });
    }
    return c.json({ discussions: out, can: (await evaCan(c.env)).forumPost });
  });
  app2.post("/api/tasks/:id/forum/post", async (c) => {
    const t = await ownTask(c.env, Number(c.req.param("id")));
    if (!t?.moodle_key?.startsWith("forum:")) return c.json({ error: "Esta tarea no es un foro." }, 400);
    const b = await c.req.json().catch(() => ({}));
    const message = (b.message || "").trim();
    if (!b.parentId || message.length < 5) return c.json({ error: "Escribe tu mensaje antes de publicar." }, 400);
    try {
      const r = await moodleCall(c.env, "mod_forum_add_discussion_post", {
        postid: b.parentId,
        subject: (b.subject || `Re: ${t.title}`).slice(0, 250),
        message: toForumHtml(message),
        messageformat: 1
      });
      if (!r.postid) return c.json({ error: r.warnings?.[0]?.message || "El EVA no confirm\xF3 la publicaci\xF3n." }, 502);
      const scanned = JSON.parse(await getSetting(c.env, "forum_scan", "{}"));
      delete scanned[t.moodle_key.split(":")[1]];
      await setSetting(c.env, "forum_scan", JSON.stringify(scanned));
      return c.json({ ok: true, postId: r.postid });
    } catch (e) {
      const m = e.message;
      return c.json({ error: /permis|capabil|acceso|access|nopermission/i.test(m) ? "El EVA no deja publicar desde aplicaciones en este foro. \xC1brelo en el EVA y pega tu texto all\xED." : m }, 502);
    }
  });
  app2.post("/api/tasks/:id/forum/draft-reply", async (c) => {
    const t = await ownTask(c.env, Number(c.req.param("id")));
    if (!t) return c.json({ error: "Tarea no encontrada." }, 404);
    const b = await c.req.json().catch(() => ({}));
    const desc = (await c.env.DB.prepare("SELECT description FROM tasks WHERE id = ?").bind(t.id).first())?.description || "";
    const reply = await llmComplete(c.env, [
      { role: "system", content: "Eres un estudiante universitario dominicano que responde en un foro acad\xE9mico. Escribe una respuesta respetuosa de 1 o 2 p\xE1rrafos al mensaje del compa\xF1ero: reconoce algo concreto de su aporte, agrega una idea propia relacionada con la consigna y cierra con una pregunta o reflexi\xF3n. Espa\xF1ol natural, sin saludos largos, sin inventar citas ni datos. Devuelve solo el texto de la respuesta." },
      { role: "user", content: `Consigna del foro \xAB${t.title}\xBB:
${desc.slice(0, 1500) || "(sin consigna)"}

Mensaje de ${b.author || "un compa\xF1ero"}:
${(b.text || "").slice(0, 2500)}` }
    ], { maxTokens: 500, temperature: 0.6 });
    return c.json({ text: reply.trim().replace(/^["«]|["»]$/g, "") });
  });
  app2.get("/api/tasks/:id/submission", async (c) => {
    const t = await ownTask(c.env, Number(c.req.param("id")));
    if (!t?.moodle_key?.startsWith("assign:")) return c.json({ error: "Esta actividad no recibe archivos." }, 400);
    const can = await evaCan(c.env);
    try {
      const r = await moodleCall(c.env, "mod_assign_get_submission_status", { assignid: Number(t.moodle_key.split(":")[1]) });
      const la = r.lastattempt || {};
      const files = (la.submission?.plugins || []).filter((p) => p.type === "file").flatMap((p) => (p.fileareas || []).flatMap((a) => a.files || [])).map((f) => ({ name: f.filename, size: f.filesize || 0 }));
      return c.json({ status: la.submission?.status || "new", files, canEdit: !!la.canedit && can.submit, canSubmit: !!la.cansubmit && can.submitGrading, enabled: la.submissionsenabled !== false, locked: !!la.locked, can });
    } catch (e) {
      return c.json({ error: e.message, can }, 502);
    }
  });
  app2.post("/api/tasks/:id/submission", async (c) => {
    const t = await ownTask(c.env, Number(c.req.param("id")));
    if (!t?.moodle_key?.startsWith("assign:")) return c.json({ error: "Esta actividad no recibe archivos." }, 400);
    if (!c.env.MOODLE_TOKEN) return c.json({ error: "Tu EVA no est\xE1 conectado." }, 400);
    const form = await c.req.formData();
    const files = form.getAll("files").filter((f) => typeof f === "object" && f !== null && "arrayBuffer" in f);
    if (!files.length) return c.json({ error: "Elige al menos un archivo." }, 400);
    if (files.reduce((a, f) => a + f.size, 0) > 40 * 1024 * 1024) return c.json({ error: "Los archivos pasan de 40 MB. S\xFAbelos desde el EVA." }, 400);
    let itemid = 0;
    const base = c.env.MOODLE_URL.replace(/\/$/, "");
    for (const f of files) {
      const fd = new FormData();
      fd.append("token", c.env.MOODLE_TOKEN);
      fd.append("filearea", "draft");
      fd.append("itemid", String(itemid));
      fd.append("file_1", f, f.name);
      const r = await fetch(`${base}/webservice/upload.php`, { method: "POST", body: fd });
      const j = await r.json().catch(() => null);
      const first = Array.isArray(j) ? j[0] ?? null : j;
      if (!r.ok || !first?.itemid) return c.json({ error: `El EVA no acept\xF3 \xAB${f.name}\xBB: ${first?.error || r.status}` }, 502);
      itemid = first.itemid;
    }
    try {
      const w = await moodleCall(c.env, "mod_assign_save_submission", { assignmentid: Number(t.moodle_key.split(":")[1]), plugindata: { files_filemanager: itemid } });
      if (Array.isArray(w) && w.length) return c.json({ error: w.map((x) => x.message).join(" \xB7 ") }, 502);
    } catch (e) {
      return c.json({ error: e.message }, 502);
    }
    return c.json({ ok: true });
  });
  app2.post("/api/tasks/:id/submission/submit", async (c) => {
    const t = await ownTask(c.env, Number(c.req.param("id")));
    if (!t?.moodle_key?.startsWith("assign:")) return c.json({ error: "Esta actividad no recibe archivos." }, 400);
    try {
      const w = await moodleCall(c.env, "mod_assign_submit_for_grading", { assignmentid: Number(t.moodle_key.split(":")[1]), acceptsubmissionstatement: 1 });
      if (Array.isArray(w) && w.length) return c.json({ error: w.map((x) => x.message).join(" \xB7 ") }, 502);
      await c.env.DB.prepare(`UPDATE tasks SET status = 'done', submitted_at = ?, notes = 'Entregada en el EVA', updated_at = ? WHERE id = ?`).bind(nowSec(), nowSec(), t.id).run();
      return c.json({ ok: true });
    } catch (e) {
      return c.json({ error: e.message }, 502);
    }
  });
  app2.get("/api/grades/history", async (c) => c.json(JSON.parse(await getSetting(c.env, "avg_history", "[]"))));
  app2.get("/api/feedback-notes", async (c) => {
    const { results } = await c.env.DB.prepare(`SELECT g.id, g.item_name, g.grade, g.grade_max, g.feedback, g.updated_at, c.name AS course_name, c.color AS course_color,
        (SELECT t.id FROM tasks t WHERE t.user_id = g.user_id AND t.moodle_key = g.moodle_key LIMIT 1) AS task_id
      FROM grades g JOIN courses c ON c.id = g.course_id WHERE g.user_id = ? AND g.feedback IS NOT NULL AND trim(g.feedback) != '' ORDER BY g.updated_at DESC LIMIT 80`).bind(c.env.UID).all();
    return c.json({ items: results, summary: JSON.parse(await getSetting(c.env, "feedback_summary", "null")) });
  });
  app2.post("/api/feedback-notes/summary", async (c) => {
    const { results } = await c.env.DB.prepare(`SELECT g.item_name, g.grade, g.grade_max, g.feedback, c.name AS course FROM grades g JOIN courses c ON c.id = g.course_id
      WHERE g.user_id = ? AND g.feedback IS NOT NULL AND trim(g.feedback) != '' ORDER BY g.updated_at DESC LIMIT 30`).bind(c.env.UID).all();
    if (!results.length) return c.json({ error: "Todav\xEDa no tienes comentarios de facilitadores." }, 400);
    const raw2 = await llmComplete(c.env, [
      { role: "system", content: 'Eres un tutor universitario dominicano. Lee los comentarios que los facilitadores le dejaron a un estudiante y responde SOLO con JSON: {"fortalezas": ["2 a 4 cosas que hace bien"], "mejorar": ["2 a 4 cosas concretas para mejorar, accionables"], "consejo": "un consejo corto y motivador"}. Espa\xF1ol sencillo; no inventes nada que no est\xE9 en los comentarios.' },
      { role: "user", content: results.map((r) => `${r.course} \xB7 ${r.item_name} (${r.grade ?? "\u2014"}/${r.grade_max}): ${r.feedback.slice(0, 500)}`).join("\n\n") }
    ], { maxTokens: 700, temperature: 0.3 });
    let j = null;
    try {
      j = JSON.parse(raw2.slice(raw2.indexOf("{"), raw2.lastIndexOf("}") + 1));
    } catch {
    }
    if (!j?.mejorar?.length && !j?.fortalezas?.length) return c.json({ error: "La IA no devolvi\xF3 un resumen v\xE1lido. Int\xE9ntalo otra vez." }, 502);
    const summary = { fortalezas: (j.fortalezas || []).slice(0, 5), mejorar: (j.mejorar || []).slice(0, 5), consejo: j.consejo || "", at: nowSec(), count: results.length };
    await setSetting(c.env, "feedback_summary", JSON.stringify(summary));
    return c.json(summary);
  });
  app2.get("/api/record", async (c) => {
    const s = await getSettings(c.env);
    const { results: pensum } = await c.env.DB.prepare("SELECT term, code, name, credits, status, grade FROM pensum WHERE user_id = ? ORDER BY term, id").bind(c.env.UID).all();
    const current = await courseSummaries(c.env);
    const rows = await bestGrades(c.env);
    const { results: past } = await c.env.DB.prepare(`SELECT id, code, name FROM courses WHERE user_id = ? AND active = 0 AND moodle_id IS NOT NULL ORDER BY updated_at DESC`).bind(c.env.UID).all();
    return c.json({
      student: s.student_name || s.eva_user || "",
      career: s.career || "",
      matricula: (await c.env.DB.prepare("SELECT login FROM users WHERE id = ?").bind(c.env.UID).first())?.login || "",
      current: current.map((x) => ({ code: x.code, name: x.name, average: x.average, graded: x.graded, total: x.total })),
      past: past.map((p) => {
        const a = courseAverage(rows.filter((r) => r.course_id === p.id)).avg;
        return { code: p.code, name: p.name, average: a === null ? null : Math.round(a * 10) / 10 };
      }),
      pensum,
      generated: nowSec()
    });
  });
  app2.post("/api/payments/:id/receipt", async (c) => {
    const id = Number(c.req.param("id"));
    const own = await c.env.DB.prepare("SELECT id FROM payments WHERE id = ? AND user_id = ?").bind(id, c.env.UID).first();
    if (!own) return c.json({ error: "Pago no encontrado." }, 404);
    const b = await c.req.json().catch(() => ({}));
    const m = (b.dataUrl || "").match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
    if (!m) return c.json({ error: "La imagen no es v\xE1lida." }, 400);
    if (m[2].length > 15e5) return c.json({ error: "La foto es muy grande. Prueba con otra." }, 400);
    await c.env.DB.prepare(`INSERT INTO payment_receipts (payment_id, user_id, mime, data, created_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(payment_id) DO UPDATE SET mime = excluded.mime, data = excluded.data, created_at = excluded.created_at`).bind(id, c.env.UID, m[1], m[2], nowSec()).run();
    return c.json({ ok: true });
  });
  app2.get("/api/payments/:id/receipt", async (c) => {
    const r = await c.env.DB.prepare("SELECT mime, data FROM payment_receipts WHERE payment_id = ? AND user_id = ?").bind(Number(c.req.param("id")), c.env.UID).first();
    if (!r) return c.json({ error: "Este pago no tiene comprobante." }, 404);
    const bin = Uint8Array.from(atob(r.data), (ch) => ch.charCodeAt(0));
    return new Response(bin, { headers: { "Content-Type": r.mime, "Cache-Control": "private, max-age=86400" } });
  });
  app2.delete("/api/payments/:id/receipt", async (c) => {
    await c.env.DB.prepare("DELETE FROM payment_receipts WHERE payment_id = ? AND user_id = ?").bind(Number(c.req.param("id")), c.env.UID).run();
    return c.json({ ok: true });
  });
}
__name(registerExtras, "registerExtras");

// src/worker/cron.ts
async function runScheduled(env) {
  const log2 = [];
  const users = await activeUsers(env);
  const envs = await Promise.all(users.map((u) => forUser(env, u.id, u.role)));
  let syncUid = 0, worst = 0;
  for (const ue of envs) {
    if (!ue.MOODLE_TOKEN) continue;
    const s = await getSettings(ue);
    const late = nowSec() - Number(s.eva_last_sync || 0) - Math.max(1, Number(s.eva_sync_hours || 2)) * 3600;
    if (late >= -300 && late + 301 > worst) {
      worst = late + 301;
      syncUid = ue.UID;
    }
  }
  let backupError;
  try {
    if (await backupDue(env)) {
      const b = await makeBackup(env);
      log2.push(`Copia de seguridad: ${b.rows} filas`);
    }
  } catch (e) {
    backupError = e.message;
    log2.push("Copia de seguridad: " + backupError);
  }
  for (const ue of envs) {
    try {
      const l = await runForUser(ue, ue.UID === syncUid, ue.ROLE === "admin" ? backupError : void 0);
      if (l.length) log2.push(`[${ue.UID}] ${l.join(" \xB7 ")}`);
    } catch (e) {
      log2.push(`[${ue.UID}] error: ${e.message}`);
    }
  }
  await env.DB.prepare("DELETE FROM sent_log WHERE sent_at < ?").bind(nowSec() - 90 * 86400).run();
  return log2;
}
__name(runScheduled, "runScheduled");
async function runForUser(env, syncNow, backupError) {
  const log2 = [];
  try {
    const n = await flushWhatsApp(env);
    if (n) log2.push(`WhatsApp pendientes: ${n}`);
  } catch (e) {
    log2.push("WhatsApp: " + e.message);
  }
  const s = await getSettings(env);
  const now = nowSec();
  const local = localDate(env);
  const today = ymd(local);
  if (syncNow && env.MOODLE_TOKEN) {
    try {
      const r = await syncEva(env);
      log2.push(`EVA: ${r.tasksNew} nuevas, ${r.tasksUpdated} actualizadas`);
      if (r.newGrades.length) log2.push(`Notas nuevas: ${r.newGrades.length}`);
      for (const n of r.newNews.filter((x) => x.source === "avisos" || x.kind === "pago" || x.kind === "evento").slice(0, 5)) {
        const icon = n.kind === "pago" ? "\u{1F4B3}" : n.kind === "evento" ? "\u{1F389}" : "\u{1F4E3}";
        const label = n.kind === "pago" ? "Aviso de pago" : n.kind === "evento" ? "Evento" : "Aviso nuevo";
        const body = n.body.length > 650 ? n.body.slice(0, 650).replace(/\s+\S*$/, "") + "\u2026" : n.body;
        await sendToMe(
          env,
          blocks(`${icon} *${label}*${n.course ? ` \xB7 _${courseLabel(n.course)}_` : ""}`, `*${n.title}*`, body),
          { title: `${icon} ${n.title}`.slice(0, 90), tag: `news-${n.kind}`, url: `/#avisos/${n.id}`, pushBody: `${n.course ? n.course + " \xB7 " : ""}${n.body.slice(0, 180)}`, type: n.kind === "pago" ? "pagos" : "avisos" }
        );
      }
    } catch (e) {
      log2.push(`EVA error: ${e.message}`);
    }
  }
  const hour = Number(s.summary_hour || 7);
  if (s.summary_enabled !== "0" && local.getUTCHours() >= hour && !await wasSent(env, `summary:${today}`)) {
    await markSent(env, `summary:${today}`);
    const r = await sendToMe(env, await summaryAlert(env), { title: "\u2600\uFE0F Tu resumen de hoy", tag: "summary", url: "/#inicio", pushBody: await summaryShort(env), type: "resumen" });
    if (!r.ok) await unmarkSent(env, `summary:${today}`);
    log2.push(`Resumen: ${r.ok ? "enviado por " + r.channels.join(" + ") : r.error}`);
  }
  const thresholds = (s.task_reminders || "72,24,3").split(",").map(Number).filter((n) => n > 0).sort((a, b) => a - b);
  if (thresholds.length) {
    const maxH = thresholds[thresholds.length - 1];
    const { results } = await env.DB.prepare(`SELECT t.id, t.title, t.due_at, c.short_name AS course, c.name AS course_name FROM tasks t LEFT JOIN courses c ON c.id = t.course_id
      WHERE t.user_id = ? AND t.status = 'pending' AND t.due_at > ? AND t.due_at <= ?`).bind(env.UID, now, now + maxH * 3600).all();
    for (const t of results) {
      const left = t.due_at - now;
      const h = thresholds.find((x) => left <= x * 3600);
      if (!h) continue;
      const key = `task:${t.id}:${h}`;
      if (await wasSent(env, key)) continue;
      for (const x of thresholds.filter((x2) => x2 >= h)) await markSent(env, `task:${t.id}:${x}`);
      const curso = courseLabel(t.course_name, t.course);
      const urgent = t.due_at - now <= 6 * 3600;
      const r = await sendToMe(env, blocks(
        `${urgent ? "\u{1F6A8}" : "\u{1F4CC}"} *${urgent ? "\xA1Vence pronto!" : "Recordatorio de entrega"}*`,
        [`*${t.title}*`, curso && `\u{1F4DA} ${curso}`, `\u23F0 Vence *${cuandoTexto(env, t.due_at)}*`, `\u23F3 ${timeLeft(t.due_at, now).replace(/^./, (x) => x.toUpperCase())}`].filter(Boolean).join("\n"),
        "_Cuando la entregues, m\xE1rcala como hecha en Rumbo._"
      ), { title: `\u{1F4CC} ${t.title}`, pushBody: `${curso ? curso + " \xB7 " : ""}vence ${cuandoTexto(env, t.due_at)}`, tag: `task-${t.id}`, url: `/#tareas/${t.id}`, type: "tareas" });
      if (!r.ok) for (const x of thresholds.filter((x2) => x2 >= h)) await unmarkSent(env, `task:${t.id}:${x}`);
      log2.push(`Tarea ${t.id} (${h} h): ${r.ok ? "ok" : r.error}`);
    }
  }
  const { results: foros } = await env.DB.prepare(`SELECT t.id, t.title, t.due_at, t.forum_replies, t.forum_needed, c.short_name AS course, c.name AS course_name FROM tasks t LEFT JOIN courses c ON c.id = t.course_id
    WHERE t.user_id = ? AND t.moodle_key LIKE 'forum:%' AND t.due_at > ? AND t.due_at <= ? AND t.forum_posts > 0 AND t.forum_needed > 0 AND COALESCE(t.forum_replies, 0) < t.forum_needed`).bind(env.UID, now, now + 2 * 86400).all();
  for (const f of foros) {
    if (!await markSent(env, `forum-replies:${f.id}`)) continue;
    const faltan = f.forum_needed - (f.forum_replies ?? 0);
    const curso = courseLabel(f.course_name, f.course);
    const r = await sendToMe(
      env,
      blocks(
        "\u{1F4AC} *Te faltan respuestas en un foro*",
        [`*${f.title}*`, curso && `\u{1F4DA} ${curso}`, `\u2705 Tu aporte ya est\xE1`, `\u270D\uFE0F Te ${faltan === 1 ? "falta 1 respuesta" : `faltan ${faltan} respuestas`} a compa\xF1eros (llevas ${f.forum_replies ?? 0} de ${f.forum_needed})`, `\u23F0 Cierra *${cuandoTexto(env, f.due_at)}*`].filter(Boolean).join("\n")
      ),
      { title: `\u{1F4AC} Faltan ${faltan} respuesta${faltan === 1 ? "" : "s"}: ${f.title}`.slice(0, 90), pushBody: `${curso ? curso + " \xB7 " : ""}cierra ${cuandoTexto(env, f.due_at)}`, tag: `forum-${f.id}`, url: `/#tareas/${f.id}`, type: "tareas" }
    );
    if (!r.ok) await unmarkSent(env, `forum-replies:${f.id}`);
    log2.push(`Foro ${f.id} sin respuestas: ${r.ok ? "avisado" : r.error}`);
  }
  const pay = await payWindow(env, s);
  const payDays = (s.pay_remind_days || "").split(",").map(Number).filter(Boolean);
  if (!pay.paid && pay.state === "open" && payDays.includes(local.getUTCDate()) && local.getUTCHours() >= hour) {
    const key = `pay:${pay.period}:${local.getUTCDate()}`;
    if (await markSent(env, key)) {
      const last = local.getUTCDate() === pay.closeDay, first = local.getUTCDate() === pay.openDay;
      const head = last ? "\u{1F6A8} *\xDAltimo d\xEDa de pago*" : first ? "\u{1F4B3} *Abri\xF3 la ventana de pago*" : "\u{1F4B3} *Recordatorio de pago*";
      const when = last ? "Cierra *hoy* a las 11:59 p. m." : `Cierra en *${pay.daysToClose} d\xEDa${pay.daysToClose === 1 ? "" : "s"}* (el d\xEDa ${pay.closeDay})`;
      const r = await sendToMe(env, blocks(
        head,
        [`\u{1F5D3}\uFE0F Cuota de *${periodLabel(pay.period)}*`, `\u23F0 ${when}`, pay.amount && `\u{1F4B0} Monto: *${money(pay.amount)}*`].filter(Boolean).join("\n"),
        "_Cuando pagues, reg\xEDstralo en Rumbo \u2192 Pagos y no te vuelvo a avisar este mes._"
      ), { title: last ? "\u{1F6A8} \xDAltimo d\xEDa de pago" : "\u{1F4B3} Ventana de pago", pushBody: `Cuota de ${periodLabel(pay.period)} \xB7 ${last ? "cierra hoy" : `cierra en ${pay.daysToClose} d\xEDas`}`, tag: "pay", url: "/#pagos", type: "pagos" });
      if (!r.ok) await unmarkSent(env, key);
      log2.push(`Pago: ${r.ok ? "ok" : r.error}`);
    }
  }
  const { results: rem } = await env.DB.prepare("SELECT id, text FROM reminders WHERE user_id = ? AND sent = 0 AND remind_at <= ? ORDER BY remind_at LIMIT 10").bind(env.UID, now + 60).all();
  for (const r0 of rem) {
    const r = await sendToMe(env, blocks("\u23F0 *Recordatorio*", r0.text), { title: "\u23F0 Recordatorio", pushBody: r0.text, tag: `rem-${r0.id}`, url: "/#inicio", type: "tareas" });
    if (r.ok) await env.DB.prepare("UPDATE reminders SET sent = 1 WHERE id = ?").bind(r0.id).run();
    log2.push(`Recordatorio ${r0.id}: ${r.ok ? "ok" : r.error}`);
  }
  try {
    await announceRelease(env);
  } catch (e) {
    log2.push("Novedades: " + e.message);
  }
  const studyHour = Number(s.study_hour || 19);
  if (s.study_enabled !== "0" && local.getUTCHours() >= studyHour && local.getUTCHours() < 23 && await markSent(env, `study:${today}`)) {
    const { results: todo } = await env.DB.prepare(`SELECT t.id, t.title, t.due_at, c.short_name AS course, c.name AS course_name FROM tasks t LEFT JOIN courses c ON c.id = t.course_id
      WHERE t.user_id = ? AND t.status = 'pending' AND t.due_at IS NOT NULL AND t.due_at > ? AND t.due_at <= ? ORDER BY t.due_at LIMIT 3`).bind(env.UID, now - 3 * 86400, now + 2 * 86400).all();
    if (todo.length) {
      const lines = todo.map((t) => {
        const c = courseLabel(t.course_name, t.course);
        return `\u2022 *${t.title}*${c ? ` _(${c})_` : ""}
   ${t.due_at < now ? "\u26A0\uFE0F atrasada" : "\u23F0 vence " + cuandoTexto(env, t.due_at)}`;
      });
      const r = await sendToMe(env, blocks("\u{1F4DA} *Hora de estudiar*", "Esto es lo que vence pronto:", lines.join("\n"), "\u{1F4A1} _Abre la tarea y toca \xABEstudiar con IA\xBB: te arma un plan y tarjetas para repasar._"), { title: `\u{1F4DA} Hora de estudiar: ${todo.length === 1 ? todo[0].title : todo.length + " tareas"}`, pushBody: todo.map((t) => `\u2022 ${t.title} \xB7 ${t.due_at < now ? "atrasada" : "vence " + cuandoTexto(env, t.due_at)}`).join("\n"), tag: "study", url: todo.length === 1 ? `/#tareas/${todo[0].id}` : "/#tareas", type: "tareas" });
      log2.push(`Hora de estudio: ${r.ok ? "avisada" : r.error}`);
    }
  }
  if (local.getUTCDay() === 0 && s.notify_plan !== "0" && local.getUTCHours() >= Number(s.plan_hour || 18) && await markSent(env, `plan:${today}`)) {
    const p = await weeklyPlan(env);
    const r = await sendToMe(env, p.text, { title: "\u{1F5D3}\uFE0F Tu plan de la semana", pushBody: p.short, tag: "plan", url: "/#tareas", type: "plan" });
    if (!r.ok) await unmarkSent(env, `plan:${today}`);
    log2.push(`Plan semanal: ${r.ok ? "enviado" : r.error}`);
  }
  try {
    await recordAverage(env);
  } catch (e) {
    log2.push("Historial del promedio: " + e.message);
  }
  try {
    const got = await checkAchievements(env);
    if (got.length) log2.push("Logros: " + got.join(", "));
  } catch (e) {
    log2.push("Logros: " + e.message);
  }
  try {
    log2.push(...await checkHealth(env, { backupError }));
  } catch (e) {
    log2.push("Salud: " + e.message);
  }
  return log2;
}
__name(runForUser, "runForUser");

// src/worker/telegram-page.ts
var TELEGRAM_PAGE = "<!doctype html>\n<html lang=\"es\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1, viewport-fit=cover\">\n<title>Telegram \u00b7 Rumbo</title><meta name=\"theme-color\" content=\"#0B1020\">\n<style>\n:root{--bg:#F5F6F8;--card:#fff;--ink:#0B1020;--ink2:#3A4152;--muted:#6E7385;--line:#E6E8EE;--blue:#229ED9;--blue2:#1B7FB0;--soft:#E8F5FC;--ok:#138A5A;--oksoft:#E5F6EE;--bad:#D0342C;--badsoft:#FDECEB;--warnsoft:#FFF3DD;--r:18px}\n@media (prefers-color-scheme:dark){:root{--bg:#0B0F1A;--card:#141A28;--ink:#F2F4F8;--ink2:#C9CEDA;--muted:#8E95A5;--line:#252C3D;--soft:#12283A;--oksoft:#10291F;--badsoft:#2E1514;--warnsoft:#2B2312}}\n*{box-sizing:border-box}html,body{margin:0}body{font:15px/1.55 -apple-system,BlinkMacSystemFont,\"SF Pro Text\",Inter,\"Segoe UI\",system-ui,sans-serif;background:var(--bg);color:var(--ink);-webkit-font-smoothing:antialiased}\n.wrap{max-width:720px;margin:0 auto;padding:22px 16px 60px}\n.top{display:flex;align-items:center;gap:10px;margin-bottom:18px}.top a{color:var(--muted);text-decoration:none;font-size:14px}.top a:hover{color:var(--ink)}\n.hero{display:flex;gap:16px;align-items:center;margin-bottom:22px}.logo{width:58px;height:58px;border-radius:16px;background:linear-gradient(135deg,#37AEE2,#1E96C8);display:grid;place-items:center;flex:none;box-shadow:0 10px 30px rgba(34,158,217,.35)}\n.logo svg{width:32px;height:32px}h1{font-size:28px;line-height:1.15;letter-spacing:-.02em;margin:0}.sub{color:var(--muted);margin:4px 0 0}\n.steps{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;margin:0 0 18px;padding:0;list-style:none}@media (max-width:520px){.steps li{padding:8px;font-size:11px}.steps li b{font-size:12px}}.steps li{flex:1;min-width:0;padding:10px 12px;border-radius:12px;background:var(--card);border:1px solid var(--line);font-size:12.5px;color:var(--muted)}\n.steps li b{display:block;color:var(--ink);font-size:13.5px}.steps li.on{border-color:var(--blue);background:var(--soft)}.steps li.done{border-color:transparent;background:var(--oksoft)}.steps li.done b::after{content:\" \u2713\";color:var(--ok)}\n.card{background:var(--card);border:1px solid var(--line);border-radius:var(--r);padding:20px;margin-bottom:14px}\n.card h2{font-size:18px;margin:0 0 4px;letter-spacing:-.01em}.card>p{margin:0 0 12px;color:var(--ink2)}\nol.how{margin:6px 0 0;padding:0;list-style:none;counter-reset:s}ol.how>li{counter-increment:s;position:relative;padding:0 0 16px 44px}ol.how>li::before{content:counter(s);position:absolute;left:0;top:0;width:30px;height:30px;border-radius:50%;background:var(--soft);color:var(--blue2);font-weight:700;display:grid;place-items:center;font-size:14px}\n@media (prefers-color-scheme:dark){ol.how>li::before{color:#7CC8F0}}\nol.how>li:not(:last-child)::after{content:\"\";position:absolute;left:14px;top:34px;bottom:4px;width:2px;background:var(--line)}\nol.how b{display:block;margin-bottom:2px}ol.how span{color:var(--ink2)}\ncode,.kbd{font:600 13px ui-monospace,\"SF Mono\",Menlo,monospace;background:var(--bg);border:1px solid var(--line);padding:2px 7px;border-radius:7px;white-space:nowrap}\n.chat{margin:10px 0 2px;display:flex;flex-direction:column;gap:6px;max-width:420px}.msg{padding:8px 12px;border-radius:14px;font-size:14px;max-width:85%}.msg.me{align-self:flex-end;background:#DCF3C8;color:#0B1020;border-bottom-right-radius:4px}.msg.bot{background:var(--bg);border:1px solid var(--line);border-bottom-left-radius:4px}\n.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;height:46px;padding:0 20px;border-radius:99px;border:1px solid var(--line);background:var(--card);color:var(--ink);font:600 15px inherit;font-family:inherit;cursor:pointer;text-decoration:none;transition:transform .15s,opacity .2s}\n.btn:active{transform:scale(.98)}.btn.primary{background:var(--blue);border-color:var(--blue);color:#fff;box-shadow:0 8px 24px rgba(34,158,217,.3)}.btn.danger{color:var(--bad)}.btn[disabled]{opacity:.55;pointer-events:none}.btn.block{width:100%}\n.row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}\ninput.tok{width:100%;height:48px;border-radius:12px;border:1px solid var(--line);background:var(--bg);color:var(--ink);padding:0 14px;font:500 14px ui-monospace,\"SF Mono\",Menlo,monospace;margin:10px 0}\ninput.tok:focus{outline:2px solid var(--blue);outline-offset:1px}\n.note{padding:12px 14px;border-radius:12px;background:var(--warnsoft);font-size:13.5px;color:var(--ink2);margin-top:12px}\n.err{padding:10px 14px;border-radius:12px;background:var(--badsoft);color:var(--bad);font-size:14px;margin-top:10px;display:none}\n.status{display:flex;align-items:center;gap:10px;padding:12px 14px;border-radius:14px;font-weight:600;margin-bottom:14px}.status i{width:10px;height:10px;border-radius:50%;flex:none}\n.status.ok{background:var(--oksoft);color:var(--ok)}.status.ok i{background:var(--ok)}.status.wait{background:var(--soft);color:var(--blue2)}.status.wait i{background:var(--blue);animation:p 1.2s infinite}.status.off{background:var(--bg);color:var(--muted);border:1px solid var(--line)}.status.off i{background:var(--muted)}\n@keyframes p{50%{opacity:.3}}\n.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px;margin-top:8px}.cmd{padding:12px;border-radius:12px;background:var(--bg);border:1px solid var(--line)}.cmd code{background:var(--card)}.cmd p{margin:6px 0 0;font-size:13.5px;color:var(--ink2)}\ndetails{border-top:1px solid var(--line);padding:12px 0}details:last-child{padding-bottom:0}summary{cursor:pointer;font-weight:600}details p{color:var(--ink2);margin:8px 0 0}\n.hide{display:none!important}.muted{color:var(--muted)}.small{font-size:13px}\n</style></head>\n<body><div class=\"wrap\">\n<div class=\"top\"><a href=\"/\">\u2190 Volver a Rumbo</a></div>\n<div class=\"hero\"><span class=\"logo\"><svg viewBox=\"0 0 24 24\" fill=\"#fff\"><path d=\"M21.9 4.6 18.7 19.8c-.2 1.1-.9 1.3-1.8.8l-4.9-3.6-2.4 2.3c-.3.3-.5.5-1 .5l.4-5 9.1-8.2c.4-.4-.1-.6-.6-.2L6.3 13.4 1.5 11.9c-1-.3-1.1-1 .2-1.5L20.6 3.1c.9-.3 1.6.2 1.3 1.5z\"/></svg></span>\n<div><h1>Rumbo en Telegram</h1><p class=\"sub\">Tus tareas, notas y pagos por chat. Le escribes o le mandas una nota de voz.</p></div></div>\n\n<ul class=\"steps\" id=\"steps\">\n  <li data-s=\"1\"><b>1. Crear el bot</b>Una vez, en BotFather</li>\n  <li data-s=\"2\"><b>2. Pegar el token</b>Aqu\u00ed abajo</li>\n  <li data-s=\"3\"><b>3. Vincular</b>Tu Telegram con tu cuenta</li>\n  <li data-s=\"4\"><b>4. Usarlo</b>Escribe o habla</li>\n</ul>\n\n<div id=\"loading\" class=\"card\"><p class=\"muted\">Cargando\u2026</p></div>\n\n<div id=\"login\" class=\"card hide\"><h2>Primero entra a Rumbo</h2><p>Esta p\u00e1gina usa tu sesi\u00f3n. Entra con tu cuenta y vuelve aqu\u00ed.</p><a class=\"btn primary\" href=\"/\">Entrar a Rumbo</a></div>\n\n<div id=\"noadmin\" class=\"card hide\"><div class=\"status off\"><i></i>El bot todav\u00eda no est\u00e1 conectado</div><p>El administrador de Rumbo tiene que crear el bot y pegar su token una sola vez. Cuando lo haga, aqu\u00ed te aparece el bot\u00f3n para vincular tu Telegram.</p></div>\n\n<!-- Paso 1 y 2: solo el administrador -->\n<div id=\"setup\" class=\"card hide\">\n  <h2>Crea tu bot (2 minutos, una sola vez)</h2>\n  <p>Telegram da los bots gratis. No necesitas computadora: se hace desde el celular.</p>\n  <ol class=\"how\">\n    <li><b>Abre a @BotFather</b><span>En Telegram, busca <code>@BotFather</code> (tiene palomita azul de verificado) y toca <b style=\"display:inline\">Iniciar</b>.</span>\n      <div class=\"row\" style=\"margin-top:8px\"><a class=\"btn\" href=\"https://t.me/BotFather\" target=\"_blank\" rel=\"noopener\">Abrir @BotFather</a></div></li>\n    <li><b>Escribe /newbot</b><span>BotFather te pregunta dos cosas:</span>\n      <div class=\"chat\"><div class=\"msg me\">/newbot</div><div class=\"msg bot\">Alright, a new bot. How are we going to call it?</div><div class=\"msg me\">Rumbo</div><div class=\"msg bot\">Good. Now let's choose a username for your bot. It must end in `bot`.</div><div class=\"msg me\">RumboKeuryBot</div></div>\n      <span class=\"small muted\">El nombre puede ser cualquiera. El usuario debe ser \u00fanico y terminar en <code>bot</code>; si est\u00e1 ocupado, prueba otro.</span></li>\n    <li><b>Copia el token</b><span>BotFather responde con un mensaje que dice <i>\u201cUse this token to access the HTTP API\u201d</i> y debajo un c\u00f3digo as\u00ed:</span>\n      <div class=\"chat\"><div class=\"msg bot\"><code>7712345678:AAH3kX9\u2026qZ4</code></div></div>\n      <span class=\"small muted\">Toca el c\u00f3digo para copiarlo. Es como una contrase\u00f1a: no lo compartas con nadie.</span></li>\n    <li><b>P\u00e9galo aqu\u00ed y toca Guardar y conectar</b>\n      <input class=\"tok\" id=\"tok\" placeholder=\"Pega aqu\u00ed el token del bot\" autocomplete=\"off\" spellcheck=\"false\" inputmode=\"text\">\n      <button class=\"btn primary block\" id=\"saveTok\" type=\"button\">Guardar y conectar el bot</button>\n      <div class=\"err\" id=\"tokErr\"></div>\n      <span class=\"small muted\" style=\"display:block;margin-top:8px\">Rumbo revisa que el token sea v\u00e1lido, conecta el bot y le pone los comandos (/hoy, /tareas, /notas, /pagos, /ayuda).</span></li>\n  </ol>\n</div>\n\n<!-- Paso 3: vincular -->\n<div id=\"link\" class=\"card hide\">\n  <div class=\"status off\" id=\"linkStatus\"><i></i><span>Tu Telegram no est\u00e1 vinculado</span></div>\n  <h2>Vincula tu Telegram</h2>\n  <p>As\u00ed el bot sabe que eres t\u00fa y solo te responde a ti.</p>\n  <ol class=\"how\">\n    <li><b>Toca \u201cAbrir mi bot\u201d</b><span>Se abre Telegram en el chat de <b style=\"display:inline\" class=\"botname\">tu bot</b>.</span></li>\n    <li><b>Toca \u201cIniciar\u201d (o \u201cStart\u201d)</b><span>El bot te responde <i>\u201c\u00a1Listo! Rumbo qued\u00f3 conectado \ud83c\udf89\u201d</i>.</span></li>\n    <li><b>Vuelve aqu\u00ed</b><span>Esta p\u00e1gina se actualiza sola cuando quedes conectado.</span></li>\n  </ol>\n  <button class=\"btn primary block\" id=\"openBot\" type=\"button\">Abrir mi bot en Telegram</button>\n  <div class=\"err\" id=\"linkErr\"></div>\n  <p class=\"small muted\" style=\"margin-top:10px\">El enlace es personal: no lo compartas. Si otra persona lo usa, el bot le responder\u00eda con tus datos.</p>\n</div>\n\n<!-- Paso 4: usarlo -->\n<div id=\"use\" class=\"card hide\">\n  <div class=\"status ok\"><i></i><span>Conectado con <span class=\"botname\">tu bot</span></span></div>\n  <h2>C\u00f3mo usarlo</h2>\n  <p>Escr\u00edbele al bot como a una persona, o usa los comandos.</p>\n  <div class=\"grid\">\n    <div class=\"cmd\"><code>/hoy</code><p>Tu resumen del d\u00eda: entregas, clases y avisos.</p></div>\n    <div class=\"cmd\"><code>/tareas</code><p>Lo que tienes pendiente, con fecha y n\u00famero.</p></div>\n    <div class=\"cmd\"><code>/notas</code><p>Tu promedio por asignatura.</p></div>\n    <div class=\"cmd\"><code>/pagos</code><p>C\u00f3mo va la cuota del per\u00edodo.</p></div>\n    <div class=\"cmd\"><code>listo 12</code><p>Marca la tarea #12 como entregada.</p></div>\n    <div class=\"cmd\"><code>ya pagu\u00e9</code><p>Registra el pago y deja de avisarte este mes.</p></div>\n    <div class=\"cmd\"><code>nota de C\u00e1lculo</code><p>Busca tu nota en una asignatura.</p></div>\n    <div class=\"cmd\"><code>\ud83c\udfa4 nota de voz</code><p>Preg\u00fantale hablando; te contesta por escrito.</p></div>\n  </div>\n  <div class=\"note\"><b>Tambi\u00e9n te escribe solo:</b> recordatorios de entregas, notas nuevas, avisos de pago y el resumen de la ma\u00f1ana, seg\u00fan lo que tengas activado en Ajustes \u2192 Notificaciones.</div>\n  <div class=\"row\" style=\"margin-top:14px\"><a class=\"btn primary\" id=\"goBot\" href=\"#\" target=\"_blank\" rel=\"noopener\">Abrir el chat</a><button class=\"btn danger\" id=\"unlink\" type=\"button\">Desvincular mi Telegram</button></div>\n</div>\n\n<!-- Administraci\u00f3n -->\n<div id=\"admin\" class=\"card hide\">\n  <h2>Administraci\u00f3n del bot</h2>\n  <p id=\"adminInfo\" class=\"muted\"></p>\n  <details><summary>Cambiar el token</summary><p>Si creaste un bot nuevo o regeneraste el token en BotFather (<code>/revoke</code>), pega el nuevo. Todos tendr\u00e1n que vincularse otra vez.</p>\n    <input class=\"tok\" id=\"tok2\" placeholder=\"Nuevo token\" autocomplete=\"off\" spellcheck=\"false\"><button class=\"btn primary\" id=\"saveTok2\" type=\"button\">Guardar nuevo token</button><div class=\"err\" id=\"tokErr2\"></div></details>\n  <details><summary>Quitar el bot</summary><p>Rumbo deja de usar el token guardado aqu\u00ed y el bot deja de responder.</p><button class=\"btn danger\" id=\"delTok\" type=\"button\">Quitar el token</button></details>\n</div>\n\n<div class=\"card\"><h2>Preguntas</h2>\n  <details><summary>\u00bfCuesta algo?</summary><p>No. Los bots y los mensajes de Telegram son gratis, sin l\u00edmite pr\u00e1ctico para este uso.</p></details>\n  <details><summary>El bot no me responde</summary><p>Revisa que est\u00e9s escribiendo al bot correcto (<span class=\"botname\">tu bot</span>) y que esta p\u00e1gina diga \u201cConectado\u201d. Si cambiaste de dominio, el administrador debe tocar \u201cCambiar el token\u201d y pegar el mismo token para volver a conectarlo.</p></details>\n  <details><summary>\u00bfCada compa\u00f1ero necesita su propio bot?</summary><p>No. Se crea un solo bot y cada persona lo vincula con su cuenta desde esta p\u00e1gina. El bot responde a cada uno con sus propios datos.</p></details>\n  <details><summary>Perd\u00ed el token</summary><p>En @BotFather escribe <code>/mybots</code>, elige tu bot y toca <b style=\"display:inline\">API Token</b>.</p></details>\n</div>\n</div>\n<script>\nconst $ = s => document.querySelector(s);\nconst show = (id, on = true) => $('#' + id).classList.toggle('hide', !on);\nlet st = null, poll = null;\nasync function api(path, body) {\n  const r = await fetch(path, { method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });\n  const j = await r.json().catch(() => ({}));\n  if (r.status === 401) throw Object.assign(new Error('login'), { login: true });\n  if (!r.ok) throw new Error(j.error || 'Algo sali\u00f3 mal (' + r.status + ')');\n  return j;\n}\nfunction steps(n) { document.querySelectorAll('#steps li').forEach(li => { const s = +li.dataset.s; li.className = s < n ? 'done' : s === n ? 'on' : ''; }); }\nfunction render() {\n  ['loading', 'login', 'noadmin', 'setup', 'link', 'use', 'admin'].forEach(id => show(id, false));\n  document.querySelectorAll('.botname').forEach(e => { e.textContent = st.username ? '@' + st.username : 'tu bot'; });\n  if (!st.configured) { steps(st.admin ? 1 : 1); show(st.admin ? 'setup' : 'noadmin'); return; }\n  if (!st.connected) { steps(3); show('link'); } else { steps(5); show('use'); $('#goBot').href = 'https://t.me/' + st.username; stopPoll(); }\n  if (st.admin) { show('admin'); $('#adminInfo').textContent = st.source === 'secreto' ? 'El token viene del secreto TELEGRAM_BOT_TOKEN de Cloudflare. Si pegas uno aqu\u00ed, el de la app tiene prioridad.' : 'El token est\u00e1 guardado en la app. Bot: @' + st.username; }\n}\nasync function load() {\n  try { st = await api('/api/telegram/status'); render(); }\n  catch (e) { show('loading', false); if (e.login) show('login'); else { $('#loading').innerHTML = '<p>' + e.message + '</p>'; show('loading'); } }\n}\nfunction stopPoll() { if (poll) { clearInterval(poll); poll = null; } }\nasync function saveToken(inp, errEl, btn) {\n  const t = $(inp).value.trim(); const err = $(errEl); err.style.display = 'none';\n  if (!t) { err.textContent = 'Pega el token que te dio BotFather.'; err.style.display = 'block'; return; }\n  const b = $(btn); b.disabled = true; const txt = b.textContent; b.textContent = 'Conectando\u2026';\n  try { await api('/api/admin/telegram/token', { token: t }); $(inp).value = ''; await load(); window.scrollTo({ top: 0, behavior: 'smooth' }); }\n  catch (e) { err.textContent = e.message; err.style.display = 'block'; }\n  b.disabled = false; b.textContent = txt;\n}\n$('#saveTok').onclick = () => saveToken('#tok', '#tokErr', '#saveTok');\n$('#saveTok2').onclick = () => saveToken('#tok2', '#tokErr2', '#saveTok2');\n$('#openBot').onclick = async () => {\n  const b = $('#openBot'), err = $('#linkErr'); err.style.display = 'none';\n  const w = window.open('', '_blank'); b.disabled = true;\n  try {\n    const r = await api('/api/telegram/setup', {});\n    if (w) w.location = r.link; else location.href = r.link;\n    const s = $('#linkStatus'); s.className = 'status wait'; s.querySelector('span').textContent = 'Esperando que toques \u201cIniciar\u201d en Telegram\u2026';\n    stopPoll(); poll = setInterval(async () => { try { const n = await api('/api/telegram/status'); if (n.connected) { st = n; render(); } } catch (e) {} }, 3000);\n  } catch (e) { if (w) w.close(); err.textContent = e.message; err.style.display = 'block'; }\n  b.disabled = false;\n};\n$('#unlink').onclick = async () => { if (!confirm('\u00bfDesvincular tu Telegram? El bot dejar\u00e1 de responderte hasta que lo vincules otra vez.')) return; await api('/api/telegram/unlink', {}); load(); };\n$('#delTok').onclick = async () => { if (!confirm('\u00bfQuitar el token? El bot dejar\u00e1 de funcionar para todos.')) return; try { await api('/api/admin/telegram/token/delete', {}); load(); } catch (e) { alert(e.message); } };\nload();\n</script>\n</body></html>\n";

// src/worker/index.ts
var app = new Hono3();
app.get("/api/health", (c) => c.json({ ok: true }));
app.get("/telegram", (c) => c.html(TELEGRAM_PAGE, 200, { "Cache-Control": "no-store" }));
app.get("/api/telegram/guia", (c) => c.html(TELEGRAM_PAGE, 200, { "Cache-Control": "no-store" }));
app.get("/api/version", (c) => c.json({ app: CHANGELOG[0].version, widget: WIDGET_VERSION, apk: `${new URL(c.req.url).origin}/rumbo-widget.apk?v=${WIDGET_VERSION}` }, 200, { "Cache-Control": "no-store" }));
app.post("/api/login", async (c) => {
  const { password, login } = await c.req.json().catch(() => ({ password: "", login: "" }));
  if (!c.env.SESSION_SECRET) return c.json({ error: "Falta el secreto SESSION_SECRET en el servidor." }, 500);
  const ip = c.req.header("cf-connecting-ip") || "local";
  const since = nowSec() - 15 * 60;
  const fails = (await c.env.DB.prepare("SELECT COUNT(*) AS n FROM login_attempts WHERE ip = ? AND at > ?").bind(ip, since).first().catch(() => null))?.n || 0;
  if (fails >= 5) return c.json({ error: "Demasiados intentos. Espera 15 minutos e int\xE9ntalo otra vez." }, 429);
  const who = normLogin(login || "");
  const user = await c.env.DB.prepare(`SELECT id, role, active, pass_hash, pass_salt FROM users WHERE ${who ? "login = ?" : "id = 1"}`).bind(...who ? [who] : []).first();
  if (!user || !user.active || !await checkPassword(c.env, user, password || "")) {
    await c.env.DB.prepare("INSERT INTO login_attempts (ip, at) VALUES (?, ?)").bind(ip, nowSec()).run().catch(() => {
    });
    if (user && fails + 1 >= 5) await sendToMe(await forUser(c.env, user.id, user.role), blocks("\u{1F510} *Bloque\xE9 intentos de entrar a tu cuenta*", "Alguien escribi\xF3 mal tu contrase\xF1a *5 veces*. Qued\xF3 bloqueado 15 minutos.", "_Si fuiste t\xFA, espera un rato. Si no, cambia tu contrase\xF1a en Ajustes \u2192 Mi cuenta._"), { title: "\u{1F510} Intentos fallidos de entrar", tag: "security", url: "/#ajustes" }).catch(() => {
    });
    const what = user ? "Contrase\xF1a incorrecta" : "No encontr\xE9 ese usuario o la contrase\xF1a no coincide";
    return c.json({ error: fails + 1 >= 5 ? "Demasiados intentos. Espera 15 minutos e int\xE9ntalo otra vez." : `${what}. Te quedan ${4 - fails} intento${4 - fails === 1 ? "" : "s"}.` }, 401);
  }
  await c.env.DB.prepare("DELETE FROM login_attempts WHERE ip = ? OR at < ?").bind(ip, nowSec() - 86400).run().catch(() => {
  });
  c.header("Set-Cookie", await createSessionCookie(c.env, user.id));
  const uenv = await forUser(c.env, user.id, user.role);
  const ua = c.req.header("user-agent") || "";
  const device = `${/Android/i.test(ua) ? "Android" : /iPhone|iPad/i.test(ua) ? "iPhone" : /Windows/i.test(ua) ? "Windows" : /Mac/i.test(ua) ? "Mac" : "otro dispositivo"} \xB7 ${/Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : /Firefox\//.test(ua) ? "Firefox" : "navegador"}`;
  c.executionCtx.waitUntil(sendToMe(uenv, blocks("\u{1F510} *Nuevo inicio de sesi\xF3n*", `\u{1F4F1} ${device}`, "_Si no fuiste t\xFA, entra a Ajustes \u2192 \xABCerrar sesi\xF3n en todos los dispositivos\xBB y cambia tu contrase\xF1a._"), { title: "\u{1F510} Nuevo inicio de sesi\xF3n", pushBody: `${device}. Si no fuiste t\xFA, cierra todas las sesiones en Ajustes.`, tag: "security", url: "/#ajustes" }).catch(() => void 0));
  return c.json({ ok: true });
});
app.post("/api/logout", (c) => {
  c.header("Set-Cookie", clearSessionCookie());
  return c.json({ ok: true });
});
var normLogin = /* @__PURE__ */ __name((s) => s.trim().toLowerCase().replace(/\s+/g, "").replace(/@p\.uapa\.edu\.do$/, ""), "normLogin");
var validLogin = /* @__PURE__ */ __name((s) => /^[a-z0-9._-]{3,40}$/.test(s), "validLogin");
async function findInvite(env, code) {
  return env.DB.prepare(`SELECT i.code, i.used_by, i.expires_at, u.name AS from_name FROM invites i LEFT JOIN users u ON u.id = i.created_by WHERE i.code = ?`).bind(code).first();
}
__name(findInvite, "findInvite");
app.get("/api/invite/:code", async (c) => {
  const inv = await findInvite(c.env, c.req.param("code"));
  if (!inv) return c.json({ error: "Esta invitaci\xF3n no existe. P\xEDdele a quien te invit\xF3 un enlace nuevo." }, 404);
  if (inv.used_by) return c.json({ error: "Esta invitaci\xF3n ya se us\xF3. Si es tuya, entra con tu matr\xEDcula y contrase\xF1a." }, 410);
  if (inv.expires_at < nowSec()) return c.json({ error: "Esta invitaci\xF3n venci\xF3. Pide un enlace nuevo." }, 410);
  return c.json({ ok: true, from: (inv.from_name || "").split(" ")[0] });
});
app.post("/api/signup", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const inv = await findInvite(c.env, b.code || "");
  if (!inv || inv.used_by || inv.expires_at < nowSec()) return c.json({ error: "La invitaci\xF3n no es v\xE1lida o ya se us\xF3. Pide un enlace nuevo." }, 400);
  const name = (b.name || "").trim().replace(/\s+/g, " ").slice(0, 60);
  const login = normLogin(b.login || "");
  if (name.length < 2) return c.json({ error: "Escribe tu nombre." }, 400);
  if (!validLogin(login)) return c.json({ error: "Tu matr\xEDcula o usuario debe tener de 3 a 40 letras o n\xFAmeros, sin espacios." }, 400);
  if ((b.password || "").length < 8) return c.json({ error: "La contrase\xF1a debe tener al menos 8 caracteres." }, 400);
  if (await c.env.DB.prepare("SELECT 1 AS x FROM users WHERE login = ?").bind(login).first()) return c.json({ error: "Ya hay una cuenta con esa matr\xEDcula. Si es tuya, entra desde la pantalla de inicio." }, 409);
  const { hash, salt } = await hashPassword(b.password);
  const row = await c.env.DB.prepare(`INSERT INTO users (login, name, pass_hash, pass_salt, role, invited_by) VALUES (?, ?, ?, ?, 'user', (SELECT created_by FROM invites WHERE code = ?)) RETURNING id`).bind(login, name, hash, salt, inv.code).first();
  if (!row) return c.json({ error: "No pude crear la cuenta. Int\xE9ntalo otra vez." }, 500);
  const used = await c.env.DB.prepare("UPDATE invites SET used_by = ? WHERE code = ? AND used_by IS NULL").bind(row.id, inv.code).run();
  if (!used.meta.changes) {
    await c.env.DB.prepare("DELETE FROM users WHERE id = ?").bind(row.id).run();
    return c.json({ error: "Esta invitaci\xF3n ya se us\xF3." }, 409);
  }
  const uenv = await forUser(c.env, row.id, "user");
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) await setSetting(uenv, k, v);
  await setSetting(uenv, "student_name", name.split(" ")[0]);
  await setSetting(uenv, "changelog_seen", String(CHANGELOG[0].version));
  const inviter = await c.env.DB.prepare("SELECT created_by FROM invites WHERE code = ?").bind(inv.code).first();
  if (inviter) c.executionCtx.waitUntil(forUser(c.env, inviter.created_by).then((ie) => sendToMe(ie, blocks(`\u{1F389} *${name} ya est\xE1 en Rumbo*`, "Acept\xF3 tu invitaci\xF3n y est\xE1 conectando su EVA."), { title: `\u{1F389} ${name} ya est\xE1 en Rumbo`, tag: "invite", url: "/#companeros" })).catch(() => void 0));
  c.header("Set-Cookie", await createSessionCookie(c.env, row.id));
  return c.json({ ok: true });
});
async function userByPhone(env, from) {
  const digits = from.replace(/\D/g, "");
  if (!digits) return null;
  const uid = await userBySetting(env, "wa_number", digits);
  if (uid) return uid;
  return env.WA_MY_NUMBER && env.WA_MY_NUMBER.replace(/\D/g, "") === digits ? 1 : null;
}
__name(userByPhone, "userByPhone");
app.get("/api/whatsapp/webhook", (c) => {
  const mode = c.req.query("hub.mode");
  const token = c.req.query("hub.verify_token");
  const challenge = c.req.query("hub.challenge");
  if (mode === "subscribe" && token && c.env.WA_VERIFY_TOKEN && token === c.env.WA_VERIFY_TOKEN) return c.text(challenge || "");
  return c.text("Forbidden", 403);
});
app.post("/api/whatsapp/webhook", async (c) => {
  const raw2 = await c.req.text();
  if (!await verifyMetaSignature(c.env, raw2, c.req.header("x-hub-signature-256") || null)) return c.text("Firma inv\xE1lida", 401);
  const body = JSON.parse(raw2 || "{}");
  const statuses = body.entry?.flatMap((e) => e.changes?.flatMap((ch) => ch.value?.statuses || []) || []) || [];
  for (const s of statuses) {
    if (s.status !== "failed") continue;
    const err = s.errors?.[0];
    const text = `${err?.code ?? "?"} ${err?.title || ""}${err?.error_data?.details ? " \xB7 " + err.error_data.details : ""}`;
    console.error(`WhatsApp no entreg\xF3 la respuesta: ${text}`);
    await setSetting(c.env, "wa_last_error", `${(/* @__PURE__ */ new Date()).toISOString()} \xB7 entrega: ${text}`);
  }
  const msgs = body.entry?.flatMap((e) => e.changes?.flatMap((ch) => ch.value?.messages || []) || []) || [];
  for (const m of msgs) {
    const uid = await userByPhone(c.env, m.from);
    if (!uid) continue;
    const uenv = await forUser(c.env, uid);
    if (m.id && !await markSent(uenv, `wa:${m.id}`)) continue;
    await setSetting(uenv, "wa_last_inbound", String(nowSec()));
    c.executionCtx.waitUntil(answerWhatsApp(uenv, m));
  }
  return c.json({ ok: true });
});
async function answerWhatsApp(env, m) {
  try {
    if (m.type === "audio" && m.audio?.id) {
      const heard = await transcribeWhatsAppAudio(env, m.audio.id);
      await logInbound(env, `\u{1F3A4} ${heard || "(audio sin palabras)"}`);
      if (!heard) {
        await sendWhatsApp(env, "No logr\xE9 entender el audio \u{1F605}. \xBFMe lo repites un poco m\xE1s despacio o me lo escribes?", m.from);
        return;
      }
      await sendWhatsApp(env, `\u{1F3A4} _"${heard}"_

${await handleCommand(env, heard, "whatsapp")}`, m.from);
      return;
    }
    const text = m.text?.body || m.button?.text || m.interactive?.button_reply?.title || "";
    if (!text) {
      await sendWhatsApp(env, 'Por ahora entiendo mensajes de texto y notas de voz. Escribe "ayuda" para ver lo que puedo hacer.', m.from);
      return;
    }
    await logInbound(env, text);
    await sendWhatsApp(env, await handleCommand(env, text, "whatsapp"), m.from);
  } catch (e) {
    await sendWhatsApp(env, `No pude responder: ${e.message}`, m.from);
  }
}
__name(answerWhatsApp, "answerWhatsApp");
app.post("/api/mail/ingest", async (c) => {
  const uid = await userBySetting(c.env, "mail_token", c.req.header("x-rumbo-token") || "");
  if (!uid) return c.json({ error: "Clave inv\xE1lida" }, 401);
  c.env = await forUser(c.env, uid);
  const b = await c.req.json().catch(() => ({ messages: [] }));
  const msgs = (b.messages || []).slice(0, 60);
  const first = !await c.env.DB.prepare(`SELECT 1 AS x FROM announcements WHERE user_id = ? AND source = 'correo' LIMIT 1`).bind(c.env.UID).first();
  let saved = 0;
  const fresh = [];
  for (const m of msgs) {
    if (!m.id) continue;
    const title = (m.subject || "(sin asunto)").replace(/^\s*((fwd?|rv|re|reenviado)\s*:\s*)+/i, "").slice(0, 300) || "(sin asunto)";
    let body = (m.body || "").replace(/\r/g, "");
    let from = (m.from || "").replace(/\s*<[^>]+>/, "").replace(/"/g, "").trim();
    const fwd = body.match(/-{3,}\s*(?:Forwarded message|Mensaje reenviado)\s*-{3,}\s*\n([\s\S]*?)\n\s*\n/i);
    if (fwd) {
      const orig = fwd[1].match(/^(?:De|From):\s*(.+)$/im);
      if (orig) from = orig[1].replace(/\s*<[^>]+>/, "").replace(/"/g, "").trim();
      body = body.slice((fwd.index ?? 0) + fwd[0].length);
    }
    body = body.replace(/\n{3,}/g, "\n\n").trim().slice(0, 6e3);
    const kind = classifyNews(`${title} ${body.slice(0, 1500)}`);
    const dup = await c.env.DB.prepare(`SELECT 1 AS x FROM announcements WHERE user_id = ? AND source = 'correo' AND title = ? AND substr(body, 1, 300) = substr(?, 1, 300) AND created_at > ? LIMIT 1`).bind(c.env.UID, title, body, nowSec() - 14 * 86400).first();
    if (dup) continue;
    const row = await c.env.DB.prepare(`INSERT OR IGNORE INTO announcements (user_id, source, ext_id, title, body, author, url, kind, created_at) VALUES (?, 'correo', ?, ?, ?, ?, ?, ?, ?) RETURNING id`).bind(c.env.UID, m.id, title, body, from || null, m.url || null, kind, Math.floor(m.date || nowSec())).first();
    if (row) {
      saved++;
      if (!first) fresh.push({ id: row.id, title, body, kind, from });
    }
  }
  await setSetting(c.env, "mail_last_at", String(nowSec()));
  for (const f of fresh.filter((x) => x.kind === "pago" || x.kind === "evento").slice(0, 5)) {
    const icon = f.kind === "pago" ? "\u{1F4B3}" : "\u{1F389}";
    c.executionCtx.waitUntil(sendToMe(
      c.env,
      blocks(`${icon} *${f.kind === "pago" ? "Correo sobre pagos" : "Correo sobre un evento"}*${f.from ? ` \xB7 _${f.from}_` : ""}`, `*${f.title}*`, f.body.length > 600 ? f.body.slice(0, 600).replace(/\s+\S*$/, "") + "\u2026" : f.body),
      { type: f.kind === "pago" ? "pagos" : "avisos", title: `${icon} ${f.title}`.slice(0, 90), tag: `mail-${f.kind}`, url: `/#avisos/${f.id}`, pushBody: `${f.from ? f.from + " \xB7 " : ""}${f.body.slice(0, 180)}` }
    ));
  }
  return c.json({ ok: true, received: msgs.length, saved });
});
app.post("/api/telegram/webhook", async (c) => {
  const secret = await getSettings(c.env).then((s) => s.tg_secret || "");
  if (!secret || !safeEqual(c.req.header("x-telegram-bot-api-secret-token") || "", secret)) return c.text("Forbidden", 403);
  const update = await c.req.json().catch(() => null);
  const m = update?.message;
  if (!m || !await markSent({ ...c.env, UID: 0 }, `tg:${update.update_id}`)) return c.json({ ok: true });
  c.executionCtx.waitUntil(answerTelegram(c.env, m));
  return c.json({ ok: true });
});
async function answerTelegram(sys, m) {
  const chat = String(m.chat.id);
  const text = (m.text || "").trim();
  const code = text.startsWith("/start") ? text.split(/\s+/)[1] || "" : "";
  const uid = code && await userBySetting(sys, "tg_link_code", code) || await userBySetting(sys, "tg_chat_id", chat);
  if (!uid) {
    await sendTelegram(sys, "Este es el bot privado de Rumbo. Para usarlo, \xE1brelo desde la app: Ajustes \u2192 Conexiones \u2192 Telegram.", chat);
    return;
  }
  const env = await forUser(sys, uid);
  const s = await getSettings(env);
  if (text.startsWith("/start")) {
    if (s.tg_link_code && code === s.tg_link_code) {
      await setSetting(env, "tg_chat_id", chat);
      await sendTelegram(env, `*\xA1Listo${s.student_name ? ", " + s.student_name : ""}!* \u{1F389} Rumbo qued\xF3 conectado.

Preg\xFAntame lo que quieras de tu trimestre, m\xE1ndame una *nota de voz*, o escribe "ayuda".`, chat);
    } else if (s.tg_chat_id !== chat) {
      await sendTelegram(env, "Este es un bot privado de Rumbo. Para vincularlo, abre el enlace desde Ajustes \u2192 Telegram en la app.", chat);
    } else {
      await sendTelegram(env, await handleCommand(env, "ayuda"), chat);
    }
    return;
  }
  if (!s.tg_chat_id || s.tg_chat_id !== chat) {
    await sendTelegram(env, "Este es un bot privado de Rumbo.", chat);
    return;
  }
  try {
    await tgCall(env, "sendChatAction", { chat_id: chat, action: "typing" }).catch(() => {
    });
    const fileId = m.voice?.file_id || m.audio?.file_id;
    if (fileId) {
      const heard = await transcribeAudio(env, await downloadTelegramFile(env, fileId));
      await env.DB.prepare("INSERT INTO messages (user_id, direction, channel, body) VALUES (?, ?, ?, ?)").bind(env.UID, "in", "telegram", `\u{1F3A4} ${heard || "(audio sin palabras)"}`).run();
      if (!heard) {
        await sendTelegram(env, "No logr\xE9 entender el audio \u{1F605}. \xBFMe lo repites o me lo escribes?", chat);
        return;
      }
      await sendTelegram(env, `\u{1F3A4} _"${heard}"_

${await handleCommand(env, heard, "telegram")}`, chat);
      return;
    }
    if (!text) {
      await sendTelegram(env, "Por ahora entiendo texto y notas de voz.", chat);
      return;
    }
    await env.DB.prepare("INSERT INTO messages (user_id, direction, channel, body) VALUES (?, ?, ?, ?)").bind(env.UID, "in", "telegram", text).run();
    await sendTelegram(env, await handleCommand(env, text.replace(/^\//, ""), "telegram"), chat);
  } catch (e) {
    await sendTelegram(env, `No pude responder: ${e.message}`, chat);
  }
}
__name(answerTelegram, "answerTelegram");
app.get("/api/calendar/:token", async (c) => {
  const uid = await userBySetting(c.env, "calendar_token", c.req.param("token").replace(/\.ics$/, ""));
  if (!uid) return c.text("No encontrado", 404);
  return new Response(await calendarIcs(await forUser(c.env, uid)), { headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "no-store" } });
});
app.get("/api/widget/:token", async (c) => {
  const uid = await userBySetting(c.env, "widget_token", c.req.param("token"));
  if (!uid) return c.json({ error: "No encontrado" }, 404);
  return c.json(await widgetData(await forUser(c.env, uid)), 200, { "Cache-Control": "no-store" });
});
app.post("/api/release/announce", async (c) => {
  for (const u of await activeUsers(c.env)) await announceRelease(await forUser(c.env, u.id, u.role)).catch((e) => console.log(`Novedades (${u.id}): ${e.message}`));
  return c.json({ ok: true, version: CHANGELOG[0].version });
});
app.use("/api/*", async (c, next) => {
  const uid = await sessionUser(c.env, c.req.header("cookie") || null);
  if (!uid) return c.json({ error: "No autorizado" }, 401);
  c.env = await forUser(c.env, uid);
  await next();
});
app.get("/api/me", async (c) => {
  const u = await c.env.DB.prepare("SELECT id, login, name, role, pass_hash IS NOT NULL AS has_password FROM users WHERE id = ?").bind(c.env.UID).first();
  c.executionCtx.waitUntil(c.env.DB.prepare("UPDATE users SET last_seen = ? WHERE id = ?").bind(nowSec(), c.env.UID).run().then(() => void 0));
  return c.json({ ok: true, user: u });
});
app.post("/api/me/password", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const u = await c.env.DB.prepare("SELECT id, pass_hash, pass_salt FROM users WHERE id = ?").bind(c.env.UID).first();
  if (!u || !await checkPassword(c.env, u, b.current || "")) return c.json({ error: "La contrase\xF1a actual no coincide." }, 400);
  if ((b.password || "").length < 8) return c.json({ error: "La nueva contrase\xF1a debe tener al menos 8 caracteres." }, 400);
  const { hash, salt } = await hashPassword(b.password);
  await c.env.DB.prepare("UPDATE users SET pass_hash = ?, pass_salt = ? WHERE id = ?").bind(hash, salt, c.env.UID).run();
  return c.json({ ok: true });
});
var AI_DAILY_LIMIT = 60;
var AI_PATHS = /^\/api\/(assistant(\/(stream|voice|voice-stream|transcribe))?|study\/\d+|tasks\/\d+\/forum\/draft-reply|feedback-notes\/summary)$/;
app.use("/api/*", async (c, next) => {
  if (c.req.method !== "POST" || c.env.ROLE === "admin" || !AI_PATHS.test(new URL(c.req.url).pathname)) return next();
  const today = new Date(Date.now() - 4 * 3600 * 1e3).toISOString().slice(0, 10);
  const s = await getSettings(c.env);
  const used = s.ai_day === today ? Number(s.ai_count || 0) : 0;
  if (used >= AI_DAILY_LIMIT) {
    const msg = `Llegaste al tope de hoy (${AI_DAILY_LIMIT} preguntas) \u{1F605}. Los motores de IA son gratis y se comparten entre todos; ma\xF1ana a las 12 a. m. vuelves a tener. Mientras tanto, todo lo dem\xE1s de Rumbo funciona igual.`;
    if (/stream/.test(c.req.path)) return new Response(`data: ${JSON.stringify({ t: "done", text: msg, say: "", done: [] })}

`, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache" } });
    if (c.req.path === "/api/assistant") return c.json({ reply: msg });
    return c.json({ error: msg }, 429);
  }
  await setSetting(c.env, "ai_day", today);
  await setSetting(c.env, "ai_count", String(used + 1));
  await next();
});
registerExtras(app);
app.post("/api/feedback", async (c) => {
  const { text } = await c.req.json().catch(() => ({ text: "" }));
  const t = (text || "").trim().slice(0, 1500);
  if (t.length < 4) return c.json({ error: "Cu\xE9ntame un poco m\xE1s (al menos unas palabras)." }, 400);
  await c.env.DB.prepare("INSERT INTO feedback (user_id, text, created_at) VALUES (?, ?, ?)").bind(c.env.UID, t, nowSec()).run();
  const who = await c.env.DB.prepare("SELECT name FROM users WHERE id = ?").bind(c.env.UID).first();
  if (c.env.ROLE !== "admin") {
    c.executionCtx.waitUntil(forUser(c.env, 1, "admin").then((a) => sendToMe(a, blocks(`\u{1F4AC} *${who?.name || "Un compa\xF1ero"} te escribi\xF3*`, t.slice(0, 600).split("\n").map((l) => `> ${l}`).join("\n")), { title: `\u{1F4AC} ${who?.name || "Comentario"}`, pushBody: t.slice(0, 180), tag: "feedback", url: "/#companeros" })).catch(() => void 0));
  }
  return c.json({ ok: true });
});
app.post("/api/me/delete", async (c) => {
  if (c.env.ROLE === "admin") return c.json({ error: "La cuenta del administrador no se puede borrar." }, 400);
  const { password } = await c.req.json().catch(() => ({ password: "" }));
  const u = await c.env.DB.prepare("SELECT id, pass_hash, pass_salt FROM users WHERE id = ?").bind(c.env.UID).first();
  if (!u || !await checkPassword(c.env, u, password || "")) return c.json({ error: "La contrase\xF1a no coincide." }, 400);
  const uid = c.env.UID;
  const p = `u${uid}:`;
  await c.env.DB.batch([
    // Hijas primero (notas y avisos apuntan a asignaturas; la caché de estudio se va con las tareas).
    ...["grades", "announcements", "tasks", "courses", "payments", "pensum", "reminders", "messages", "push_subs", "feedback"].map((t) => c.env.DB.prepare(`DELETE FROM ${t} WHERE user_id = ?`).bind(uid)),
    c.env.DB.prepare("DELETE FROM settings WHERE substr(key, 1, ?) = ?").bind(p.length, p),
    c.env.DB.prepare("DELETE FROM sent_log WHERE substr(key, 1, ?) = ?").bind(p.length, p),
    c.env.DB.prepare("DELETE FROM users WHERE id = ?").bind(uid)
  ]);
  c.header("Set-Cookie", clearSessionCookie());
  return c.json({ ok: true });
});
app.use("/api/admin/*", async (c, next) => {
  if (c.env.ROLE !== "admin") return c.json({ error: "Solo el administrador puede hacer esto." }, 403);
  await next();
});
app.get("/api/admin/users", async (c) => {
  const { results: users } = await c.env.DB.prepare(`SELECT u.id, u.login, u.name, u.role, u.active, u.created_at, u.last_seen,
      (SELECT value FROM settings WHERE key = 'u' || u.id || ':eva_last_sync') AS eva_last_sync,
      (SELECT COUNT(*) FROM tasks t WHERE t.user_id = u.id) AS tasks,
      (SELECT value FROM settings WHERE key = 'u' || u.id || ':callmebot_apikey') IS NOT NULL
        AND (SELECT value FROM settings WHERE key = 'u' || u.id || ':callmebot_apikey') != '' AS whatsapp,
      (SELECT value FROM settings WHERE key = 'u' || u.id || ':ai_count' AND (SELECT value FROM settings WHERE key = 'u' || u.id || ':ai_day') = date('now', '-4 hours')) AS ai_today
    FROM users u ORDER BY u.id`).all();
  const { results: feedback } = await c.env.DB.prepare(`SELECT f.id, f.text, f.created_at, u.name FROM feedback f LEFT JOIN users u ON u.id = f.user_id ORDER BY f.id DESC LIMIT 20`).all();
  const { results: invites } = await c.env.DB.prepare("SELECT code, note, created_at, expires_at FROM invites WHERE used_by IS NULL AND expires_at > ? ORDER BY created_at DESC").bind(nowSec()).all();
  return c.json({ users, invites, feedback, aiLimit: AI_DAILY_LIMIT });
});
app.post("/api/admin/invites", async (c) => {
  const { note } = await c.req.json().catch(() => ({ note: "" }));
  const code = randomHex(9);
  await c.env.DB.prepare("INSERT INTO invites (code, created_by, note, expires_at) VALUES (?, ?, ?, ?)").bind(code, c.env.UID, (note || "").slice(0, 60) || null, nowSec() + 14 * 86400).run();
  return c.json({ code, link: `${new URL(c.req.url).origin}/#unirme/${code}` });
});
app.delete("/api/admin/invites/:code", async (c) => {
  await c.env.DB.prepare("DELETE FROM invites WHERE code = ? AND used_by IS NULL").bind(c.req.param("code")).run();
  return c.json({ ok: true });
});
app.patch("/api/admin/users/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (id === c.env.UID) return c.json({ error: "No puedes pausar tu propia cuenta." }, 400);
  const { active } = await c.req.json();
  await c.env.DB.prepare("UPDATE users SET active = ? WHERE id = ?").bind(active ? 1 : 0, id).run();
  return c.json({ ok: true });
});
app.post("/api/admin/users/:id/reset", async (c) => {
  const id = Number(c.req.param("id"));
  const temp = randomHex(4);
  const { hash, salt } = await hashPassword(temp);
  await c.env.DB.prepare("UPDATE users SET pass_hash = ?, pass_salt = ? WHERE id = ?").bind(hash, salt, id).run();
  return c.json({ ok: true, password: temp });
});
app.get("/api/mascot", async (c) => c.json(await widgetData(c.env)));
app.get("/api/dashboard", async (c) => {
  const s = await getSettings(c.env);
  const setup = { eva: !!c.env.MOODLE_TOKEN && !s.eva_last_error, whatsapp: callmebotConfigured(c.env), career: !!s.career };
  return c.json({ ...await dashboard(c.env), mascot: await widgetData(c.env), setup });
});
async function ownCourse(env, id) {
  if (id === null || id === void 0 || id === "") return null;
  const r = await env.DB.prepare("SELECT id FROM courses WHERE id = ? AND user_id = ?").bind(Number(id), env.UID).first();
  return r?.id ?? null;
}
__name(ownCourse, "ownCourse");
app.get("/api/tasks", async (c) => {
  const status = c.req.query("status");
  return c.json(await listTasks(c.env, { status: status || void 0, limit: 300 }));
});
app.get("/api/tasks/:id", async (c) => {
  const [t] = await listTasks(c.env, { id: Number(c.req.param("id")), limit: 1 });
  return t ? c.json(t) : c.json({ error: "Tarea no encontrada." }, 404);
});
app.post("/api/tasks/:id/grade", async (c) => {
  const id = Number(c.req.param("id"));
  const b = await c.req.json().catch(() => ({}));
  const grade = Number(b.grade), max = Number(b.max || 100);
  if (!Number.isFinite(grade) || !Number.isFinite(max) || max <= 0 || grade < 0 || grade > max) return c.json({ error: `Escribe una nota entre 0 y ${max || 100}.` }, 400);
  const t = await c.env.DB.prepare("SELECT id, title, course_id, moodle_key FROM tasks WHERE id = ? AND user_id = ?").bind(id, c.env.UID).first();
  if (!t) return c.json({ error: "Tarea no encontrada." }, 404);
  if (!t.course_id) return c.json({ error: "Primero as\xEDgnale una asignatura a la tarea (Editar tarea)." }, 400);
  const key = t.moodle_key || `task:${t.id}`;
  if (!t.moodle_key) await c.env.DB.prepare("UPDATE tasks SET moodle_key = ? WHERE id = ?").bind(key, t.id).run();
  const rows = (await c.env.DB.prepare("SELECT id, item_name, grade_max FROM grades WHERE user_id = ? AND moodle_key = ?").bind(c.env.UID, key).all()).results.sort((a, b2) => Number(/calificaci/i.test(b2.item_name)) - Number(/calificaci/i.test(a.item_name)) || a.id - b2.id);
  const now = nowSec();
  if (rows[0]) {
    const scaled = Math.round(grade / max * rows[0].grade_max * 100) / 100;
    await c.env.DB.prepare(`UPDATE grades SET grade = ?, source = 'manual', updated_at = ? WHERE id = ?`).bind(scaled, now, rows[0].id).run();
  } else {
    await c.env.DB.prepare(`INSERT INTO grades (user_id, course_id, moodle_item_id, item_name, grade, grade_max, moodle_key, source, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'manual', ?)`).bind(c.env.UID, t.course_id, -(2e9 + t.id), t.title, grade, max, key, now).run();
  }
  return c.json({ ok: true });
});
app.delete("/api/tasks/:id/grade", async (c) => {
  const id = Number(c.req.param("id"));
  const t = await c.env.DB.prepare("SELECT moodle_key FROM tasks WHERE id = ? AND user_id = ?").bind(id, c.env.UID).first();
  if (!t?.moodle_key) return c.json({ ok: true });
  await c.env.DB.prepare(`DELETE FROM grades WHERE user_id = ? AND moodle_item_id = ?`).bind(c.env.UID, -(2e9 + id)).run();
  await c.env.DB.prepare(`UPDATE grades SET grade = NULL, source = NULL WHERE user_id = ? AND moodle_key = ? AND source = 'manual'`).bind(c.env.UID, t.moodle_key).run();
  return c.json({ ok: true });
});
app.get("/api/tasks/:id/files/:n", async (c) => {
  const t = await c.env.DB.prepare("SELECT attachments FROM tasks WHERE id = ? AND user_id = ?").bind(Number(c.req.param("id")), c.env.UID).first();
  const f = JSON.parse(t?.attachments || "[]")[Number(c.req.param("n"))];
  const base = c.env.MOODLE_URL.replace(/\/$/, "");
  if (!f || !c.env.MOODLE_TOKEN || !f.url.startsWith(base)) return c.json({ error: "Archivo no encontrado." }, 404);
  const u = new URL(f.url.replace("/pluginfile.php/", "/webservice/pluginfile.php/").replace("/webservice/webservice/", "/webservice/"));
  u.searchParams.set("token", c.env.MOODLE_TOKEN);
  const r = await fetch(u.toString());
  if (!r.ok) return c.json({ error: `El EVA respondi\xF3 ${r.status}.` }, 502);
  return new Response(r.body, { headers: {
    "Content-Type": r.headers.get("Content-Type") || "application/octet-stream",
    "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(f.name)}`,
    "Cache-Control": "private, max-age=3600"
  } });
});
app.get("/api/search", async (c) => {
  const fold4 = /* @__PURE__ */ __name((x) => String(x ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""), "fold");
  const words = fold4(c.req.query("q")).split(/\s+/).filter((w) => w.length > 1);
  if (!words.length) return c.json({ tasks: [], news: [], courses: [] });
  const hit = /* @__PURE__ */ __name((...parts) => {
    const t = fold4(parts.join(" "));
    return words.every((w) => t.includes(w));
  }, "hit");
  const tasks = (await c.env.DB.prepare(`SELECT t.id, t.title, t.due_at, t.status, t.description, c.name AS course_name, c.color AS course_color FROM tasks t LEFT JOIN courses c ON c.id = t.course_id
    WHERE t.user_id = ? ORDER BY t.status = 'done', COALESCE(t.due_at, 0) DESC LIMIT 600`).bind(c.env.UID).all()).results.filter((t) => hit(t.title, t.course_name, t.description)).slice(0, 12).map(({ description: _d, ...t }) => t);
  const news = (await c.env.DB.prepare(`SELECT a.id, a.title, a.body, a.kind, a.created_at, c.name AS course_name FROM announcements a LEFT JOIN courses c ON c.id = a.course_id
    WHERE a.user_id = ? ORDER BY a.created_at DESC LIMIT 400`).bind(c.env.UID).all()).results.filter((n) => hit(n.title, n.body, n.course_name)).slice(0, 8).map(({ body: _b, ...n }) => ({ ...n, title: cleanNewsText(n.title) }));
  const courses = (await c.env.DB.prepare("SELECT id, name, code, color, facilitator, facilitator_eva FROM courses WHERE user_id = ? AND active = 1").bind(c.env.UID).all()).results.filter((x) => hit(x.name, x.code, x.facilitator, x.facilitator_eva)).slice(0, 6);
  return c.json({ tasks, news, courses });
});
app.post("/api/tasks", async (c) => {
  const b = await c.req.json();
  if (!b.title?.trim()) return c.json({ error: "El t\xEDtulo es obligatorio." }, 400);
  const r = await c.env.DB.prepare(`INSERT INTO tasks (user_id, title, due_at, course_id, notes, source, status) VALUES (?, ?, ?, ?, ?, 'manual', 'pending') RETURNING id`).bind(c.env.UID, b.title.trim(), b.due_at ?? null, await ownCourse(c.env, b.course_id), b.notes ?? null).first();
  return c.json({ id: r?.id });
});
app.patch("/api/tasks/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const b = await c.req.json();
  const fields = [], binds = [];
  for (const k of ["title", "due_at", "course_id", "notes", "status"]) {
    if (k in b) {
      fields.push(`${k} = ?`);
      binds.push(b[k] ?? null);
    }
  }
  if (!fields.length) return c.json({ ok: true });
  if ("course_id" in b) binds[fields.indexOf("course_id = ?")] = await ownCourse(c.env, b.course_id);
  await c.env.DB.prepare(`UPDATE tasks SET ${fields.join(", ")}, updated_at = ? WHERE id = ? AND user_id = ?`).bind(...binds, nowSec(), id, c.env.UID).run();
  return c.json({ ok: true });
});
app.delete("/api/tasks/:id", async (c) => {
  await c.env.DB.prepare("DELETE FROM tasks WHERE id = ? AND user_id = ?").bind(Number(c.req.param("id")), c.env.UID).run();
  return c.json({ ok: true });
});
app.post("/api/mail/setup", async (c) => {
  const s = await getSettings(c.env);
  let token = s.mail_token;
  if (!token) {
    const bytes = crypto.getRandomValues(new Uint8Array(24));
    token = [...bytes].map((x) => x.toString(16).padStart(2, "0")).join("");
    await setSetting(c.env, "mail_token", token);
  }
  return c.json({ token, url: new URL("/api/mail/ingest", c.req.url).href, lastAt: Number(s.mail_last_at || 0) || null });
});
app.post("/api/mail/reset", async (c) => {
  await setSetting(c.env, "mail_token", "");
  return c.json({ ok: true });
});
app.post("/api/telegram/setup", async (c) => {
  if (!telegramReady(c.env)) return c.json({ error: c.env.ROLE === "admin" ? "Falta el token del bot. P\xE9galo en " + new URL("/telegram", c.req.url).href : "El administrador todav\xEDa no ha conectado el bot de Telegram." }, 400);
  try {
    return c.json(await setupTelegram(c.env, new URL(c.req.url).origin));
  } catch (e) {
    return c.json({ error: e.message }, 502);
  }
});
app.get("/api/telegram/status", async (c) => {
  const s = await getSettings(c.env);
  return c.json({ configured: telegramReady(c.env), connected: !!s.tg_chat_id, username: s.tg_username || "", admin: c.env.ROLE === "admin", source: c.env.TG_TOKEN_SOURCE || "" });
});
app.post("/api/admin/telegram/token", async (c) => {
  const { token } = await c.req.json().catch(() => ({ token: "" }));
  const t = String(token || "").trim();
  if (!TG_TOKEN_RE.test(t)) return c.json({ error: "Ese no parece un token de BotFather. Tiene esta forma: 123456789:AAH...(unos 35 caracteres)" }, 400);
  try {
    const me = await tgCall({ ...c.env, TELEGRAM_BOT_TOKEN: t }, "getMe");
    if (!me.is_bot) throw new Error("Ese token no es de un bot.");
  } catch (e) {
    return c.json({ error: "Telegram no acept\xF3 el token: " + e.message + ". C\xF3pialo otra vez desde @BotFather." }, 400);
  }
  await setSetting(c.env, "tg_bot_token", t);
  resetTelegramToken(t);
  c.env.TELEGRAM_BOT_TOKEN = t;
  c.env.TG_TOKEN_SOURCE = "app";
  try {
    return c.json({ ok: true, ...await setupTelegram(c.env, new URL(c.req.url).origin) });
  } catch (e) {
    return c.json({ error: "Guard\xE9 el token, pero no pude configurar el bot: " + e.message }, 502);
  }
});
app.post("/api/admin/telegram/token/delete", async (c) => {
  if (telegramReady(c.env)) await tgCall(c.env, "deleteWebhook", { drop_pending_updates: true }).catch(() => {
  });
  await setSetting(c.env, "tg_bot_token", "");
  resetTelegramToken("");
  return c.json({ ok: true });
});
app.post("/api/telegram/unlink", async (c) => {
  await setSetting(c.env, "tg_chat_id", "");
  await setSetting(c.env, "tg_link_code", "");
  return c.json({ ok: true });
});
app.post("/api/calendar/setup", async (c) => {
  const s = await getSettings(c.env);
  let token = s.calendar_token;
  if (!token) {
    token = [...crypto.getRandomValues(new Uint8Array(20))].map((x) => x.toString(16).padStart(2, "0")).join("");
    await setSetting(c.env, "calendar_token", token);
  }
  const url = `${new URL(c.req.url).origin}/api/calendar/${token}.ics`;
  return c.json({ url, webcal: url.replace(/^https:/, "webcal:"), google: `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(url.replace(/^https:/, "webcal:"))}` });
});
app.post("/api/widget/setup", async (c) => {
  const s = await getSettings(c.env);
  let token = s.widget_token;
  if (!token) {
    token = [...crypto.getRandomValues(new Uint8Array(20))].map((x) => x.toString(16).padStart(2, "0")).join("");
    await setSetting(c.env, "widget_token", token);
  }
  const origin = new URL(c.req.url).origin;
  return c.json({ link: `rumbo://conectar?u=${encodeURIComponent(origin)}&t=${token}`, apk: `${origin}/rumbo-widget.apk?v=${WIDGET_VERSION}`, preview: await widgetData(c.env) });
});
app.post("/api/widget/reset", async (c) => {
  await setSetting(c.env, "widget_token", "");
  return c.json({ ok: true });
});
app.get("/api/backups", async (c) => c.json({ enabled: !!c.env.BACKUPS && c.env.ROLE === "admin", list: c.env.ROLE === "admin" ? await listBackups(c.env) : [] }));
app.post("/api/backups", async (c) => {
  if (c.env.ROLE !== "admin") return c.json({ error: "Solo el administrador hace copias de toda la base." }, 403);
  try {
    return c.json({ ok: true, backup: await makeBackup(c.env) });
  } catch (e) {
    return c.json({ error: e.message }, 500);
  }
});
app.get("/api/backups/download", async (c) => {
  const key = c.req.query("key");
  let json;
  if (key && c.env.BACKUPS && c.env.ROLE === "admin") {
    const buf = await c.env.BACKUPS.get(key, "arrayBuffer");
    if (!buf) return c.json({ error: "Copia no encontrada" }, 404);
    json = await gunzip(buf);
  } else json = JSON.stringify(await dumpData(c.env, true));
  const name = `rumbo-datos-${(key || (/* @__PURE__ */ new Date()).toISOString()).replace(/^backup:/, "").slice(0, 19).replace(/[:T]/g, "-")}.json`;
  return new Response(json, { headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" } });
});
app.post("/api/study/:id", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const mode = ["plan", "tarjetas", "explica", "foro"].includes(b.mode || "") ? b.mode : "plan";
  try {
    return c.json(await study(c.env, Number(c.req.param("id")), mode, !!b.fresh));
  } catch (e) {
    return c.json({ error: /cuota|motor/i.test(e.message) ? "Los motores de IA est\xE1n ocupados. Int\xE9ntalo en un minuto." : e.message }, 502);
  }
});
app.get("/api/achievements", async (c) => c.json(await achievements(c.env)));
app.post("/api/logout-all", async (c) => {
  await setSetting(c.env, "session_version", String(Date.now()));
  c.header("Set-Cookie", clearSessionCookie());
  return c.json({ ok: true });
});
app.post("/api/calendar/reset", async (c) => {
  await setSetting(c.env, "calendar_token", "");
  return c.json({ ok: true });
});
app.post("/api/tasks/:id/focus", async (c) => {
  const { minutes } = await c.req.json();
  const m = Math.max(0, Math.min(180, Math.round(Number(minutes) || 0)));
  await c.env.DB.prepare("UPDATE tasks SET focus_minutes = focus_minutes + ? WHERE id = ? AND user_id = ?").bind(m, Number(c.req.param("id")), c.env.UID).run();
  return c.json({ ok: true });
});
app.get("/api/changelog", (c) => c.json(CHANGELOG));
app.post("/api/ai/test", async (c) => c.env.ROLE === "admin" ? c.json({ results: await testEngines(c.env) }) : c.json({ error: "Solo el administrador." }, 403));
app.get("/api/badges", async (c) => {
  c.executionCtx.waitUntil(announceRelease(c.env).catch((e) => console.log("Novedades: " + e.message)));
  const now = nowSec();
  const endOfDay = now + 86400 - (now - 4 * 3600) % 86400;
  const seen = Number((await getSettings(c.env)).news_seen_id || 0);
  const news = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM announcements WHERE user_id = ? AND read = 0 AND id > ? AND (source IN ('avisos', 'correo', 'rumbo', 'notas') OR kind IN ('pago', 'evento'))`).bind(c.env.UID, seen).first();
  const tasks = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM tasks WHERE user_id = ? AND status = 'pending' AND due_at IS NOT NULL AND due_at < ? AND due_at > ?`).bind(c.env.UID, endOfDay, now - 3 * 86400).first();
  return c.json({ news: news?.n ?? 0, tasks: tasks?.n ?? 0 });
});
app.get("/api/announcements", async (c) => {
  const { results } = await c.env.DB.prepare(`SELECT a.id, a.source, a.title, a.body, a.author, a.url, a.kind, a.created_at, a.read, c.name AS course_name, c.color AS course_color
    FROM announcements a LEFT JOIN courses c ON c.id = a.course_id WHERE a.user_id = ? ORDER BY a.created_at DESC, a.id DESC LIMIT 120`).bind(c.env.UID).all();
  return c.json(results.map((r) => ({ ...r, title: cleanNewsText(r.title), body: r.body ? cleanNewsText(r.body) : r.body })));
});
app.post("/api/announcements/seen", async (c) => {
  const r = await c.env.DB.prepare("SELECT MAX(id) AS m FROM announcements WHERE user_id = ?").bind(c.env.UID).first();
  await setSetting(c.env, "news_seen_id", String(r?.m ?? 0));
  return c.json({ ok: true });
});
app.post("/api/announcements/read", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  if (b.ids?.length) await c.env.DB.prepare(`UPDATE announcements SET read = 1 WHERE user_id = ? AND id IN (${b.ids.map(() => "?").join(",")})`).bind(c.env.UID, ...b.ids).run();
  else await c.env.DB.prepare("UPDATE announcements SET read = 1 WHERE user_id = ? AND read = 0").bind(c.env.UID).run();
  return c.json({ ok: true });
});
app.get("/api/courses", async (c) => c.json(await courseSummaries(c.env)));
app.get("/api/courses/history", async (c) => {
  const { results } = await c.env.DB.prepare(`SELECT c.id, c.code, c.name, c.color, c.updated_at,
      (SELECT AVG(g.grade * 100.0 / g.grade_max) FROM grades g WHERE g.course_id = c.id AND g.grade IS NOT NULL AND g.grade_max > 0) AS average,
      (SELECT COUNT(*) FROM grades g WHERE g.course_id = c.id AND g.grade IS NOT NULL) AS graded,
      (SELECT COUNT(*) FROM tasks t WHERE t.course_id = c.id AND t.status = 'done') AS delivered
    FROM courses c WHERE c.user_id = ? AND c.active = 0 AND c.moodle_id IS NOT NULL ORDER BY c.updated_at DESC`).bind(c.env.UID).all();
  return c.json(results.map((r) => ({ ...r, average: r.average === null ? null : Math.round(r.average * 10) / 10 })));
});
app.get("/api/courses/:id/grades", async (c) => {
  const { results } = await c.env.DB.prepare(`SELECT g.id, g.item_name, g.grade, g.grade_max, g.weight, g.moodle_key, g.source, t.id AS task_id, t.due_at, t.status
    FROM grades g LEFT JOIN tasks t ON g.moodle_key IS NOT NULL AND t.user_id = g.user_id AND t.moodle_key = g.moodle_key
    WHERE g.user_id = ? AND g.course_id = ? ORDER BY COALESCE(t.due_at, 9999999999), g.id`).bind(c.env.UID, Number(c.req.param("id"))).all();
  const byKey = /* @__PURE__ */ new Map();
  const out = [];
  for (const r of results) {
    if (!r.moodle_key) {
      out.push(r);
      continue;
    }
    const prev = byKey.get(r.moodle_key);
    if (!prev) {
      byKey.set(r.moodle_key, r);
      out.push(r);
      continue;
    }
    if (prev.grade === null && r.grade !== null) out[out.indexOf(prev)] = r, byKey.set(r.moodle_key, r);
  }
  return c.json(out.map((r) => ({ ...r, item_name: r.moodle_key?.startsWith("forum:") ? r.item_name.replace(/\s+(calificaci[oó]n|foro completo)$/i, "") : r.item_name })));
});
app.post("/api/courses", async (c) => {
  const b = await c.req.json();
  if (!b.name?.trim()) return c.json({ error: "El nombre es obligatorio." }, 400);
  await c.env.DB.prepare("INSERT INTO courses (user_id, name, code, short_name, color, facilitator) VALUES (?, ?, ?, ?, ?, ?)").bind(c.env.UID, b.name.trim(), b.code || null, b.code || b.name.trim().split(" ")[0], b.color || "#1F5FE0", b.facilitator || null).run();
  return c.json({ ok: true });
});
app.patch("/api/courses/:id", async (c) => {
  const b = await c.req.json();
  const fields = [], binds = [];
  for (const k of ["name", "code", "short_name", "color", "facilitator", "active"]) {
    if (k in b) {
      fields.push(`${k} = ?`);
      binds.push(b[k] ?? null);
    }
  }
  if (fields.length) await c.env.DB.prepare(`UPDATE courses SET ${fields.join(", ")} WHERE id = ? AND user_id = ?`).bind(...binds, Number(c.req.param("id")), c.env.UID).run();
  return c.json({ ok: true });
});
app.get("/api/payments", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT p.id, p.period, p.amount, p.paid_at, p.note, (SELECT 1 FROM payment_receipts r WHERE r.payment_id = p.id) AS has_receipt FROM payments p WHERE p.user_id = ? ORDER BY p.paid_at DESC LIMIT 60").bind(c.env.UID).all();
  return c.json({ window: await payWindow(c.env), history: results });
});
app.post("/api/payments", async (c) => {
  const b = await c.req.json();
  const period = b.period || (await payWindow(c.env)).period;
  await c.env.DB.prepare("INSERT INTO payments (user_id, period, amount, paid_at, note) VALUES (?, ?, ?, ?, ?)").bind(c.env.UID, period, b.amount ?? null, nowSec(), b.note ?? null).run();
  return c.json({ ok: true });
});
app.delete("/api/payments/:id", async (c) => {
  await c.env.DB.prepare("DELETE FROM payments WHERE id = ? AND user_id = ?").bind(Number(c.req.param("id")), c.env.UID).run();
  return c.json({ ok: true });
});
app.get("/api/pensum", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT id, term, code, name, credits, status, grade, prereqs, coreqs, kind FROM pensum WHERE user_id = ? ORDER BY term, id").bind(c.env.UID).all();
  return c.json(results);
});
var insertPensum = /* @__PURE__ */ __name((env, r) => env.DB.prepare("INSERT INTO pensum (user_id, term, code, name, credits, status, grade, prereqs) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(env.UID, Number(r.term) || 1, r.code || null, r.name, Number(r.credits) || 0, r.status || "pendiente", r.grade ?? null, r.prereqs || null), "insertPensum");
app.post("/api/pensum", async (c) => {
  const b = await c.req.json();
  if (!b.name?.trim()) return c.json({ error: "El nombre es obligatorio." }, 400);
  await insertPensum(c.env, b).run();
  return c.json({ ok: true });
});
app.post("/api/pensum/import", async (c) => {
  const rows = await c.req.json();
  if (!Array.isArray(rows) || !rows.length) return c.json({ error: "Env\xEDa una lista de asignaturas." }, 400);
  await c.env.DB.batch([c.env.DB.prepare("DELETE FROM pensum WHERE user_id = ?").bind(c.env.UID), ...rows.filter((r) => r.name).map((r) => insertPensum(c.env, r))]);
  return c.json({ ok: true, count: rows.length });
});
app.patch("/api/pensum/:id", async (c) => {
  const b = await c.req.json();
  const fields = [], binds = [];
  for (const k of ["term", "code", "name", "credits", "status", "grade", "prereqs", "coreqs", "kind"]) {
    if (k in b) {
      fields.push(`${k} = ?`);
      binds.push(b[k] ?? null);
    }
  }
  if (fields.length) await c.env.DB.prepare(`UPDATE pensum SET ${fields.join(", ")} WHERE id = ? AND user_id = ?`).bind(...binds, Number(c.req.param("id")), c.env.UID).run();
  return c.json({ ok: true });
});
app.get("/api/careers", async (c) => {
  const s = await getSettings(c.env);
  const cur = findCareer(s.career || "");
  return c.json({
    current: cur ? { id: cur.id, name: cur.name, version: cur.pensum?.version, source: cur.pensum?.source, totalCredits: cur.pensum?.totalCredits, notes: cur.pensum?.notes || [], electives: cur.pensum?.electives || [] } : null,
    careers: CAREERS.map((k) => ({ id: k.id, name: k.name, area: k.area, available: !!k.pensum }))
  });
});
app.post("/api/pensum/career", async (c) => {
  const { career } = await c.req.json();
  const car = findCareer(career || "");
  if (!car) return c.json({ error: "Carrera no encontrada." }, 400);
  if (!car.pensum) return c.json({ error: `El pensum de ${car.name} todav\xEDa no est\xE1 cargado en Rumbo.` }, 400);
  const norm = /* @__PURE__ */ __name((x) => x.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim(), "norm");
  const { results: old } = await c.env.DB.prepare("SELECT code, name, status, grade FROM pensum WHERE user_id = ?").bind(c.env.UID).all();
  const { results: eva } = await c.env.DB.prepare("SELECT code, name FROM courses WHERE user_id = ? AND active = 1").bind(c.env.UID).all();
  const same = /* @__PURE__ */ __name((a, b) => {
    const x = norm(a), y = norm(b);
    return x.length > 6 && y.length > 6 && (x.includes(y) || y.includes(x));
  }, "same");
  let enCurso = 0;
  const rows = car.pensum.items.map((it) => {
    const prev = old.find((o) => it.code && o.code === it.code || same(o.name, it.name));
    const inEva = eva.some((e) => it.code && e.code === it.code || same(e.name, it.name));
    const status = prev && prev.status !== "pendiente" ? prev.status : inEva ? "en_curso" : "pendiente";
    if (status === "en_curso") enCurso++;
    return c.env.DB.prepare("INSERT INTO pensum (user_id, term, code, name, credits, status, grade, prereqs, coreqs, kind) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(c.env.UID, it.term, it.code, it.name, it.credits, status, prev?.grade ?? null, it.prereqs || null, it.coreqs || null, it.kind || "obligatoria");
  });
  await c.env.DB.batch([c.env.DB.prepare("DELETE FROM pensum WHERE user_id = ?").bind(c.env.UID), ...rows]);
  await setSetting(c.env, "career", car.id);
  return c.json({ ok: true, count: rows.length, enCurso });
});
app.delete("/api/pensum/:id", async (c) => {
  await c.env.DB.prepare("DELETE FROM pensum WHERE id = ? AND user_id = ?").bind(Number(c.req.param("id")), c.env.UID).run();
  return c.json({ ok: true });
});
var EDITABLE = ["goals", "ics_study", "notify_plan", "plan_hour", "wa_tipos", "wa_quiet", "wa_number", "notify_tareas", "notify_notas", "notify_pagos", "notify_avisos", "notify_resumen", "notify_novedades", "push_also_wa", "summary_hour", "summary_enabled", "task_reminders", "pay_open_day", "pay_close_day", "pay_remind_days", "pay_amount", "term_start", "term_end", "student_name", "eva_sync_hours", "study_hour", "study_enabled"];
app.get("/api/settings", async (c) => {
  const s = await getSettings(c.env);
  return c.json({
    settings: Object.fromEntries(EDITABLE.map((k) => [k, s[k] ?? ""])),
    status: {
      eva: { configured: !!c.env.MOODLE_TOKEN, lastSync: Number(s.eva_last_sync || 0) || null, error: s.eva_last_error || "", user: s.eva_user || "" },
      whatsapp: { server: waServerReady(c.env), number: s.wa_number || (c.env.UID === 1 ? (c.env.WA_MY_NUMBER || "").replace(/\D/g, "") : ""), configured: waConfigured(c.env), windowOpen: await waWindowOpen(c.env), lastInbound: Number(s.wa_last_inbound || 0) || null, lastError: s.wa_last_error || "" },
      callmebot: { configured: callmebotConfigured(c.env), number: callmebotConfigured(c.env) ? (c.env.WA_MY_NUMBER || "").replace(/\D/g, "") : "", bot: CALLMEBOT_NUMBER, activate: CALLMEBOT_ACTIVATE },
      mail: { connected: !!s.mail_token, lastAt: Number(s.mail_last_at || 0) || null },
      telegram: { configured: telegramReady(c.env), connected: !!s.tg_chat_id, username: s.tg_username || "" },
      ai: { engines: [...providers(c.env).map((p) => p.name), ...c.env.AI ? ["Workers AI"] : []] },
      calendar: { connected: !!s.calendar_token },
      push: { devices: (await c.env.DB.prepare("SELECT COUNT(*) AS n FROM push_subs WHERE user_id = ?").bind(c.env.UID).first())?.n ?? 0 },
      voice: { ready: !!c.env.AI && waConfigured(c.env) },
      waLink: waServerReady(c.env) ? await waChatLink(c.env, "hola").catch(() => void 0) : void 0,
      career: findCareer(s.career || "")?.name || "",
      role: c.env.ROLE
    }
  });
});
app.put("/api/settings", async (c) => {
  const b = await c.req.json();
  if ("wa_number" in b) {
    let n = String(b.wa_number || "").replace(/\D/g, "");
    if (/^(809|829|849)\d{7}$/.test(n)) n = "1" + n;
    if (n && n.length < 10) return c.json({ error: "Ese n\xFAmero de WhatsApp est\xE1 incompleto. Escr\xEDbelo con el c\xF3digo de \xE1rea, por ejemplo 809 555 1234." }, 400);
    const other = n ? await userBySetting(c.env, "wa_number", n) : null;
    if (other && other !== c.env.UID) return c.json({ error: "Ese n\xFAmero ya lo usa otra cuenta de Rumbo." }, 409);
    b.wa_number = n;
  }
  for (const k of EDITABLE) if (k in b) await setSetting(c.env, k, String(b[k] ?? ""));
  return c.json({ ok: true });
});
app.post("/api/eva/connect", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  if (!b.username?.trim() || !b.password) return c.json({ error: "Escribe tu matr\xEDcula y tu contrase\xF1a del EVA." }, 400);
  const base = c.env.MOODLE_URL.replace(/\/$/, "");
  let token = "";
  try {
    const res = await fetch(`${base}/login/token.php?service=moodle_mobile_app`, { method: "POST", body: new URLSearchParams({ username: b.username.trim(), password: b.password }) });
    const j = await res.json().catch(() => ({}));
    if (!j.token) return c.json({ error: j.errorcode === "invalidlogin" ? "El EVA no acept\xF3 esa matr\xEDcula y contrase\xF1a. Revisa que sean las mismas con las que entras al EVA, o usa la opci\xF3n \xABCon el enlace del EVA\xBB." : `El EVA respondi\xF3: ${j.error || "sin token"}. Prueba la opci\xF3n \xABCon el enlace del EVA\xBB.`, method: "link" }, 400);
    token = j.token;
  } catch {
    return c.json({ error: "No pude comunicarme con el EVA. Int\xE9ntalo en un momento." }, 502);
  }
  return saveEvaToken(c.env, token).then((r) => c.json(r, r.ok ? 200 : 400));
});
app.post("/api/eva/token", async (c) => {
  const { value } = await c.req.json().catch(() => ({ value: "" }));
  const v = (value || "").trim();
  let token = /^[a-f0-9]{32}$/i.test(v) ? v : "";
  const m = v.match(/token=([A-Za-z0-9+/=_-]+)/);
  if (!token && m) {
    try {
      token = atob(m[1].replace(/-/g, "+").replace(/_/g, "/")).split(":::")[1] || "";
    } catch {
      token = "";
    }
  }
  if (!/^[a-f0-9]{32}$/i.test(token)) return c.json({ error: "Eso no parece el enlace del EVA. Debe empezar con moodlemobile://token=" }, 400);
  return saveEvaToken(c.env, token).then((r) => c.json(r, r.ok ? 200 : 400));
});
async function saveEvaToken(env, token) {
  const res = await fetch(`${env.MOODLE_URL.replace(/\/$/, "")}/webservice/rest/server.php`, { method: "POST", body: new URLSearchParams({ wstoken: token, wsfunction: "core_webservice_get_site_info", moodlewsrestformat: "json" }) });
  const site = await res.json().catch(() => ({}));
  if (!site.fullname) return { ok: false, error: `El EVA no acept\xF3 la conexi\xF3n: ${site.message || "token inv\xE1lido"}` };
  await setSetting(env, "moodle_token", token);
  await setSetting(env, "eva_user", site.fullname);
  await setSetting(env, "eva_last_error", "");
  return { ok: true, user: site.fullname };
}
__name(saveEvaToken, "saveEvaToken");
app.post("/api/eva/disconnect", async (c) => {
  await setSetting(c.env, "moodle_token", "");
  return c.json({ ok: true });
});
app.post("/api/callmebot/setup", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  let phone = String(b.phone || "").replace(/\D/g, "");
  if (/^(809|829|849)\d{7}$/.test(phone)) phone = "1" + phone;
  const apikey = String(b.apikey || "").trim();
  if (phone.length < 10) return c.json({ error: "Escribe tu n\xFAmero de WhatsApp con el c\xF3digo de \xE1rea, por ejemplo 809 555 1234." }, 400);
  if (!/^[A-Za-z0-9]{4,32}$/.test(apikey)) return c.json({ error: "La clave (apikey) son los n\xFAmeros o letras que te mand\xF3 CallMeBot por WhatsApp." }, 400);
  const other = await userBySetting(c.env, "wa_number", phone);
  if (other && other !== c.env.UID) return c.json({ error: "Ese n\xFAmero ya lo usa otra cuenta de Rumbo." }, 409);
  const name = (await getSettings(c.env)).student_name || "";
  const r = await sendCallMeBot({ ...c.env, WA_MY_NUMBER: phone, CALLMEBOT_APIKEY: apikey }, `*\u2705 Rumbo conectado${name ? ", " + name : ""}*
Desde ahora te llegan aqu\xED el resumen del d\xEDa, las entregas, las notas nuevas, los pagos y los avisos.`);
  if (r.kind === "invalid") return c.json({ error: `CallMeBot dice que esa clave no es del n\xFAmero +${phone}. Usa exactamente el mismo WhatsApp desde el que le escribiste a CallMeBot (con el 1 delante si es de RD) y la clave que te mand\xF3.` }, 400);
  if (!r.ok && r.kind !== "busy") return c.json({ error: `CallMeBot no lo envi\xF3: ${r.error}. Int\xE9ntalo en un minuto.` }, 400);
  await setSetting(c.env, "wa_number", phone);
  await setSetting(c.env, "callmebot_apikey", apikey);
  if (r.kind === "busy") await setSetting(c.env, "wa_outbox", JSON.stringify([{ t: "*\u2705 Rumbo conectado*\nDesde ahora te llegan aqu\xED el resumen del d\xEDa y tus avisos.", at: nowSec() }]));
  return c.json({ ok: true, number: phone, pending: r.kind === "busy" });
});
app.post("/api/callmebot/remove", async (c) => {
  await setSetting(c.env, "callmebot_apikey", "");
  return c.json({ ok: true });
});
app.post("/api/sync", async (c) => {
  try {
    return c.json({ ok: true, result: await syncEva(c.env) });
  } catch (e) {
    return c.json({ error: e.message }, 502);
  }
});
app.post("/api/notify/test", async (c) => c.json(await sendToMe(c.env, await summaryAlert(c.env), { title: "\u2600\uFE0F Tu resumen de hoy", tag: "summary", url: "/#inicio", pushBody: await summaryShort(c.env) })));
app.post("/api/whatsapp/repair", async (c) => {
  const env = c.env;
  if (env.ROLE !== "admin") return c.json({ ok: false, steps: ["Solo el administrador puede revisar la cuenta de WhatsApp."] }, 403);
  if (!waConfigured(env)) return c.json({ ok: false, steps: ["Faltan secretos WA_PHONE_NUMBER_ID, WA_TOKEN o WA_MY_NUMBER."] });
  const auth = { Authorization: `Bearer ${env.WA_TOKEN}` };
  const steps = [];
  const graph = /* @__PURE__ */ __name(async (path, init = {}) => {
    const res = await fetch(`${GRAPH}/${path}`, { ...init, headers: { ...auth, ...init.headers || {} } });
    const body = await res.json().catch(() => ({}));
    return { ok: res.ok, body };
  }, "graph");
  const phone = await graph(`${env.WA_PHONE_NUMBER_ID}?fields=display_phone_number,verified_name,status,quality_rating,account_mode,code_verification_status`);
  if (!phone.ok) return c.json({ ok: false, steps: [`El token no funciona con el n\xFAmero: ${phone.body.error?.message} (c\xF3digo ${phone.body.error?.code})`] });
  const p = phone.body;
  steps.push(`N\xFAmero ${p.display_phone_number} (${p.verified_name || "sin nombre"}) \xB7 estado: ${p.status || "\u2014"} \xB7 modo: ${p.account_mode || "\u2014"}`);
  if (!env.WA_WABA_ID) {
    steps.push("Falta el secreto WA_WABA_ID para revisar la suscripci\xF3n.");
    return c.json({ ok: false, steps });
  }
  const before = await graph(`${env.WA_WABA_ID}/subscribed_apps`);
  if (!before.ok) {
    steps.push(`No pude leer las apps suscritas: ${before.body.error?.message}`);
    return c.json({ ok: false, steps });
  }
  const apps = (before.body.data || []).map((a) => a.whatsapp_business_api_data?.name || "app");
  steps.push(apps.length ? `Apps suscritas antes: ${apps.join(", ")}` : "No hab\xEDa ninguna app suscrita a la cuenta (por eso no llegaban tus mensajes).");
  const sub = await graph(`${env.WA_WABA_ID}/subscribed_apps`, { method: "POST" });
  steps.push(sub.ok ? "Suscripci\xF3n de la app a la cuenta: hecha \u2705" : `No pude suscribir la app: ${sub.body.error?.message} (c\xF3digo ${sub.body.error?.code})`);
  await setSetting(env, "wa_display_number", (p.display_phone_number || "").replace(/\D/g, ""));
  return c.json({ ok: sub.ok, steps });
});
app.get("/api/push/key", async (c) => c.json({ key: await vapidPublicKey(c.env) }));
app.post("/api/push/subscribe", async (c) => {
  const b = await c.req.json();
  if (!b.endpoint?.startsWith("https://") || !b.keys?.p256dh || !b.keys?.auth) return c.json({ error: "Suscripci\xF3n inv\xE1lida." }, 400);
  await c.env.DB.prepare(`INSERT INTO push_subs (user_id, endpoint, p256dh, auth, user_agent) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, user_agent = excluded.user_agent`).bind(c.env.UID, b.endpoint, b.keys.p256dh, b.keys.auth, (c.req.header("user-agent") || "").slice(0, 200)).run();
  await setSetting(c.env, "app_origin", new URL(c.req.url).origin);
  return c.json({ ok: true });
});
app.post("/api/push/unsubscribe", async (c) => {
  const b = await c.req.json();
  if (b.endpoint) await c.env.DB.prepare("DELETE FROM push_subs WHERE endpoint = ? AND user_id = ?").bind(b.endpoint, c.env.UID).run();
  return c.json({ ok: true });
});
app.post("/api/push/test", async (c) => {
  const r = await sendPushAll(c.env, { title: "\u{1F514} Notificaciones activadas", body: "As\xED te llegar\xE1n tus res\xFAmenes, entregas y pagos.", tag: "test", url: "/#inicio", wa: await waChatLink(c.env).catch(() => void 0) });
  return c.json(r.sent ? { ok: true, ...r } : { ok: false, ...r, error: r.error || "No hay dispositivos suscritos." });
});
app.get("/api/plan/preview", async (c) => c.json(await weeklyPlan(c.env)));
app.post("/api/plan/send", async (c) => {
  const p = await weeklyPlan(c.env);
  return c.json(await sendToMe(c.env, p.text, { title: "\u{1F5D3}\uFE0F Tu plan de la semana", pushBody: p.short, tag: "plan", url: "/#tareas" }));
});
app.get("/api/summary-preview", async (c) => c.json({ text: await summaryAlert(c.env) }));
async function chatApp(env, text) {
  await env.DB.prepare("INSERT INTO messages (user_id, direction, channel, body) VALUES (?, ?, ?, ?)").bind(env.UID, "in", "app", text.slice(0, 2e3)).run();
  const reply = await handleCommand(env, text, "app");
  await env.DB.prepare("INSERT INTO messages (user_id, direction, channel, body) VALUES (?, ?, ?, ?)").bind(env.UID, "out", "app", reply.slice(0, 4e3)).run();
  return reply;
}
__name(chatApp, "chatApp");
app.post("/api/assistant", async (c) => {
  const { text } = await c.req.json();
  if (!text?.trim()) return c.json({ reply: await handleCommand(c.env, "ayuda") });
  return c.json({ reply: await chatApp(c.env, text.trim()) });
});
app.post("/api/assistant/voice", async (c) => {
  const audio = new Uint8Array(await c.req.arrayBuffer());
  if (audio.length < 800) return c.json({ error: "El audio qued\xF3 vac\xEDo. Mant\xE9n pulsado un poco m\xE1s." }, 400);
  try {
    const heard = await transcribeAudio(c.env, audio, c.req.header("content-type") || "audio/webm");
    if (!heard) return c.json({ heard: "", reply: "No logr\xE9 entender el audio \u{1F605}. \xBFMe lo repites un poco m\xE1s despacio?" });
    return c.json({ heard, reply: await chatApp(c.env, heard) });
  } catch (e) {
    return c.json({ error: e.message }, 502);
  }
});
app.post("/api/assistant/stream", async (c) => {
  const { text, voice } = await c.req.json();
  const msg = (text || "").trim().slice(0, 2e3);
  const env = c.env;
  const headers = { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" };
  if (!msg) return new Response(`data: ${JSON.stringify({ t: "done", text: await handleCommand(env, "ayuda"), say: "", done: [] })}

`, { headers });
  await env.DB.prepare("INSERT INTO messages (user_id, direction, channel, body) VALUES (?, ?, ?, ?)").bind(env.UID, "in", "app", msg).run();
  const save = /* @__PURE__ */ __name((reply) => env.DB.prepare("INSERT INTO messages (user_id, direction, channel, body) VALUES (?, ?, ?, ?)").bind(env.UID, "out", "app", reply.slice(0, 4e3)).run().then(() => void 0), "save");
  const quick = voice ? "" : await handleCommand(env, msg, "app", { noAi: true });
  if (quick) {
    await save(quick);
    return new Response(`data: ${JSON.stringify({ t: "done", text: quick, say: "", done: [] })}

`, { headers });
  }
  return new Response(aiStream(env, msg, "app", save, { voice: !!voice }), { headers });
});
app.post("/api/assistant/voice-stream", async (c) => {
  const audio = new Uint8Array(await c.req.arrayBuffer());
  const headers = { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" };
  if (audio.length < 800) return new Response(`data: ${JSON.stringify({ t: "done", text: "", say: "", done: [], empty: true })}

`, { headers });
  const env = c.env;
  const save = /* @__PURE__ */ __name((reply) => env.DB.prepare("INSERT INTO messages (user_id, direction, channel, body) VALUES (?, ?, ?, ?)").bind(env.UID, "out", "app", reply.slice(0, 4e3)).run().then(() => void 0), "save");
  return new Response(aiStream(env, "", "app", save, { voice: true, audio, mime: c.req.header("content-type") || "audio/webm" }), { headers });
});
app.post("/api/assistant/transcribe", async (c) => {
  const audio = new Uint8Array(await c.req.arrayBuffer());
  if (audio.length < 800) return c.json({ error: "El audio qued\xF3 vac\xEDo." }, 400);
  try {
    return c.json({ heard: await transcribeAudio(c.env, audio, c.req.header("content-type") || "audio/webm") });
  } catch (e) {
    return c.json({ error: e.message }, 502);
  }
});
var VOICES = ["aquila", "celeste", "selena", "sirio", "javier", "estrella", "nestor", "carina", "alvaro", "diana"];
var TTS_DAILY_CHARS = 700;
app.post("/api/tts", async (c) => {
  const { text, voice } = await c.req.json();
  const t = (text || "").replace(/[*_~#•]/g, "").replace(/\s+/g, " ").trim().slice(0, 400);
  if (!t) return c.json({ error: "Sin texto" }, 400);
  const s = await getSettings(c.env);
  const today = new Date(Date.now() - 4 * 3600 * 1e3).toISOString().slice(0, 10);
  const used = s.tts_day === today ? Number(s.tts_chars || 0) : 0;
  if (used + t.length > TTS_DAILY_CHARS) return c.json({ error: "Se acab\xF3 la voz premium de hoy", fallback: true }, 429);
  try {
    const speaker = VOICES.includes(voice || "") ? voice : "aquila";
    const out = await c.env.AI.run("@cf/deepgram/aura-2-es", { text: t, speaker, encoding: "mp3" }, { returnRawResponse: true });
    if (out instanceof Response && !/audio/.test(out.headers.get("content-type") || "")) throw new Error((await out.text()).slice(0, 160));
    const body = out instanceof Response ? out.body : out.audio ? Uint8Array.from(atob(out.audio), (ch) => ch.charCodeAt(0)) : out;
    await setSetting(c.env, "tts_day", today);
    await setSetting(c.env, "tts_chars", String(used + t.length));
    return new Response(body, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" } });
  } catch (e) {
    return c.json({ error: e.message, fallback: true }, 502);
  }
});
app.get("/api/assistant/memory", async (c) => c.json({ memory: await getMemory(c.env) }));
app.put("/api/assistant/memory", async (c) => {
  const { memory } = await c.req.json();
  await setMemory(c.env, memory || "");
  return c.json({ ok: true });
});
app.post("/api/assistant/reset", async (c) => {
  await c.env.DB.prepare(`DELETE FROM messages WHERE user_id = ? AND channel = 'app'`).bind(c.env.UID).run();
  return c.json({ ok: true });
});
app.get("/api/messages", async (c) => {
  const ch = c.req.query("channel");
  const { results } = await (ch ? c.env.DB.prepare("SELECT id, direction, channel, body, created_at FROM messages WHERE user_id = ? AND channel = ? ORDER BY id DESC LIMIT 60").bind(c.env.UID, ch) : c.env.DB.prepare("SELECT id, direction, channel, body, created_at FROM messages WHERE user_id = ? ORDER BY id DESC LIMIT 40").bind(c.env.UID)).all();
  return c.json(results.reverse());
});
app.post("/api/cron/run", async (c) => c.env.ROLE === "admin" ? c.json({ log: await runScheduled({ ...c.env, UID: 0 }) }) : c.json({ error: "Solo el administrador." }, 403));
app.all("/api/*", (c) => c.json({ error: "Ruta no encontrada" }, 404));
var index_default = {
  // Sin sesión todavía, el Env es «del sistema» (UID 0); el middleware lo cambia por el del usuario.
  fetch: /* @__PURE__ */ __name(async (req, env, ctx) => app.fetch(req, await loadTelegramToken({ ...env, UID: 0 }), ctx), "fetch"),
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(loadTelegramToken({ ...env, UID: 0 }).then((e) => runScheduled(e)).then((log2) => console.log(log2.join(" | "))));
  }
};
export {
  index_default as default
};
//# sourceMappingURL=index.js.map
