import { AppProps, LifeCycleFn } from "single-spa";

const defaultOptions: Required<SingleSpaCssOpts> = {
  cssUrls: [],
  webpackExtractedCss: false,
  timeout: 5000,
  shouldUnmount: true,
  createLink: (url) => {
    const linkEl = document.createElement("link");
    linkEl.href = url;
    linkEl.rel = "stylesheet";
    return linkEl;
  },
};

/**
 * type SingleSpaCssOpts = {
 *   cssUrls: CssUrl[];
 *   webpackExtractedCss?: boolean;
 *   timeout?: number;
 *   shouldUnmount?: boolean;
 *   createLink?: (url: string) => HTMLLinkElement;
 * };
 * @param _opts 
 * @returns 
 */
export default function singleSpaCss<ExtraProps>(
  _opts: SingleSpaCssOpts
): CSSLifecycles<ExtraProps> {
  // _opts 必须是对象
  // opts.cssUrls 必须是数组

  // Requires polyfill in IE11
  // 合并默认值
  const opts: Required<SingleSpaCssOpts> = Object.assign(
    {},
    defaultOptions,
    _opts
  );

  const allCssUrls = opts.cssUrls;
  if (opts.webpackExtractedCss) {
    // 要使用 opts.webpackExtractedCss ，需要在你的 webpack 配置中添加 exposeruntimecssassetplugin 。

    // 添加 webpack上的 css
    allCssUrls.push(
      ...__webpack_require__.cssAssets.map(
        (fileName) =>
          __webpack_public_path__ +
          __webpack_require__.cssAssetFileName(fileName)
      )
    );
  }

  /** 添加时 mount 时都添加，但是删除时 linkElementsToUnmount 属性有关， */
  const linkElements: LinkElements = {};
  /** shouldUnmount 属性有关，会在 mount 时添加，unmount 时删除 */
  let linkElementsToUnmount: ElementsToUnmount[] = [];

  /**
   * 这个应该是一个预加载式的生命周期
   * 通过 allCssUrls 创建 link DOM。
   * 使用 Promise.all 方法，
   * 应该是方便 append 之后then方法调用时保证已经添加成功
   * @param props 
   * @returns 
   */
  function bootstrap(props: AppProps) {
    return Promise.all(
      allCssUrls.map(
        (cssUrl) =>
          new Promise<void>((resolve, reject) => {
            const [url] = extractUrl(cssUrl);
            // 寻找是否存在 link DOM
            const preloadEl = document.querySelector(
              `link[rel="preload"][as="style"][href="${url}"]`
            );

            // 如果没有，创建 link DOM
            if (!preloadEl) {
              const linkEl = document.createElement("link");
              // 指定用户代理必须根据 as 属性给出的潜在目的地（以及与相应目的地相关的优先级），为当前导航预先获取和缓存目标资源。
              // 将rel设定为preload，表示浏览器应该预加载该资源 
              linkEl.rel = "preload";
              // as属性表示获取特定的内容类
              linkEl.setAttribute("as", "style");
              linkEl.href = url;
              document.head.appendChild(linkEl);
            }

            // Don't wait for preload to finish before finishing bootstrap
            // 不要等到预加载完成后才完成 bootstrap
            resolve();
          })
      )
    );
  }

  /**
   * 挂载的生命周期
   * 添加 link 节点，更新 linkElements 对象
   * 
   * @param props 
   * @returns 
   */
  function mount(props: AppProps) {
    return Promise.all(
      allCssUrls.map(
        (cssUrl) =>
          new Promise<void>((resolve, reject) => {
            const [url, shouldUnmount] = extractUrl(cssUrl);

            const existingLinkEl = document.querySelector(
              `link[rel="stylesheet"][href="${url}"]`
            );

            if (existingLinkEl) {
              linkElements[url] = existingLinkEl as HTMLLinkElement;
              resolve();
            } else {
              // 默认方法其实就是创建 link 标签
              const linkEl = opts.createLink(url);
              // load 事件在 依赖资源如样式表和图片都已完成加载时触发。
              linkEl.addEventListener("load", () => {
                resolve();
              });
              linkElements[url] = linkEl;
              document.head.appendChild(linkEl);

              if (shouldUnmount) {
                linkElementsToUnmount.push([linkEl, url]);
              }
            }
          })
      )
    );
  }

  /**
   * linkElementsToUnmount 的数组才会被删除，然后将属性变成 []
   * 同时会删除 linkElements 的属性
   * @param props 
   * @returns 
   */
  function unmount(props: AppProps) {
    const elements = linkElementsToUnmount;

    // reset this array immediately so that only one mounted instance tries to unmount
    // the link elements at a time
    linkElementsToUnmount = [];

    return Promise.all(
      elements.map(([linkEl, url]) =>
        Promise.resolve().then(() => {
          delete linkElements[url];
          if (linkEl.parentNode) {
            linkEl.parentNode.removeChild(linkEl);
          }
        })
      )
    );
  }

  /** 获得 cssUrl、shouldUnmount 属性 */
  function extractUrl(cssUrl: CssUrl): [string, boolean] {
    if (typeof cssUrl === "string") {
      return [cssUrl, opts.shouldUnmount];
    } else {
      return [
        cssUrl.href,
        cssUrl.hasOwnProperty("shouldUnmount")
          ? cssUrl.shouldUnmount
          : opts.shouldUnmount,
      ];
    }
  }

  return { bootstrap, mount, unmount };
}

type SingleSpaCssOpts = {
  cssUrls: CssUrl[];
  webpackExtractedCss?: boolean;
  timeout?: number;
  shouldUnmount?: boolean;
  createLink?: (url: string) => HTMLLinkElement;
};

type CssUrl =
  | string
  | {
      href: string;
      shouldUnmount: boolean;
    };

type LinkElements = {
  [url: string]: HTMLLinkElement;
};

type ElementsToUnmount = [HTMLLinkElement, string];

type CSSLifecycles<ExtraProps> = {
  bootstrap: LifeCycleFn<ExtraProps>;
  mount: LifeCycleFn<ExtraProps>;
  unmount: LifeCycleFn<ExtraProps>;
};
