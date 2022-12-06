import {H0Navigator, H0Spec, HistoryMode} from "./h0";

export function initClient(spec: H0Spec, context: Window = window) {
    const scope = spec.scope || "/";
    const {renderView, mount, fetchModel, selectRoot} = spec;
    const rootElement = selectRoot?.(document) || document.documentElement;
    if (!rootElement)
        throw new Error(`Root element not found`);

    const h0 = new EventTarget() as H0Navigator;
    (rootElement as HTMLElement).addEventListener("submit", (e: SubmitEvent) => {
        if (submitForm(e.target as HTMLFormElement, e.submitter))
            e.preventDefault();
    }, {capture: true});

    (rootElement as HTMLElement).addEventListener("click", async (e: MouseEvent) => {
        if ((e.target instanceof HTMLAnchorElement) && navigate((e.target as HTMLAnchorElement).href, "push"))
            e.preventDefault();
    }, {capture: true});

    async function respond(url: string, response: Response | null, historyMode: HistoryMode) {
        if (!response) {
            location.href = url;
            return;
        }

        switch (response.status) {
        case 200:
            await renderView(response, selectRoot(context.document) as HTMLElement);
            switch (historyMode) {
                case "push":
                    context.history.pushState(null, "", url);
                    break;
                case "replace":
                    context.history.replaceState(null, "", url);
                    break;
            }
            h0.dispatchEvent(new Event("navigate"));
            break;
        case 201:
            navigate(location.href, "transparent");
            break;
        case 302:
            navigate(response.headers.get("Location")!, "replace");
            break;
        default:
            break;
        }
    }

    function navigate(info: RequestInfo, historyMode: HistoryMode) {
        const req = info instanceof Request ? info : new Request(info);
        const {pathname} = new URL(req.url);
        if (!pathname.startsWith(scope))
            return false;

        fetchModel(req).then(response => respond(req.url, response, historyMode));
        return true;
    }

    function submitForm(form: HTMLFormElement, submitter?: HTMLElement | null) {
        const body : FormData | null = new FormData(form);
        const method = (submitter?.getAttribute("formmethod") || form.method || "GET").toUpperCase();
        const action = submitter?.getAttribute("formaction") || form.action;
        if (submitter && submitter.hasAttribute("name") && submitter.hasAttribute("value"))
            body.set(submitter.getAttribute("name")!, submitter.getAttribute("value")!);

        const historyMode = action === location.href ? "replace" : "push";
        if (method === "POST")
            return navigate(new Request(action, {body, method}), historyMode);

        const url = new URL(action);
        for (const [k, v] of body)
            url.searchParams.append(k, v.toString());
        return navigate(url.href, historyMode);
    }

    function reload() { return navigate(scope, "transparent"); }
    Object.assign(h0, {navigate, reload});
    navigate(location.pathname.startsWith(scope) ? location.href : scope, "replace");
    if (RUNTIME === "window") {
        mount?.(rootElement as HTMLElement, {window: context, h0});
        h0.dispatchEvent(new Event("navigate"));
    }

}
