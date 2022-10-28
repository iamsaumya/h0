declare global {
    var RUNTIME: "window" | "node";
}

import {H0Spec} from "./h0";

export type HistoryMode = "push" | "replace" | "transparent";

export interface Navigator {
    navigate(info: RequestInfo, historyMode: HistoryMode): boolean;
    submitForm(form: HTMLFormElement, submitter?: HTMLElement | null): boolean;
    reload(): void;
}

export function initClient(spec: H0Spec, context: Window = window) {
    const route = spec.route || ((r: RequestInfo) => fetch(r));
    const {scope, selectRoot, render, mount} = spec;
    const rootElement = selectRoot(document);
    if (!rootElement)
        throw new Error(`Root element not found`);

    (rootElement as HTMLElement).addEventListener("submit", (e: SubmitEvent) => {
        if (submitForm(e.target as HTMLFormElement, e.submitter))
            e.preventDefault();
    }, {capture: true});

    (rootElement as HTMLElement).addEventListener("click", async (e: MouseEvent) => {
        if ((e.target instanceof HTMLAnchorElement) && navigate((e.target as HTMLAnchorElement).href, "push"))
            e.preventDefault();
    }, {capture: true});

    navigate(location.pathname.startsWith(scope) ? location.href : scope, "replace");
    if (RUNTIME === "window")
        mount?.(rootElement as HTMLElement, {window: context, h0: {navigate, reload, submitForm}});

    function navigate(info: RequestInfo, historyMode: HistoryMode) {
        const req = new Request(info);
        const {pathname} = new URL(req.url);
        if (!pathname.startsWith(scope))
            return false;

        route(req).then(async (response: Response | null) => {
            if (!response) {
                location.href = req.url;
                return;
            }

            switch (response.status) {
            case 200:
                render(response, selectRoot(context.document) as HTMLElement);
                switch (historyMode) {
                    case "push":
                        context.history.pushState(null, "", req.url);
                        break;
                    case "replace":
                        context.history.replaceState(null, "", req.url);
                        break;
                }
                break;

            case 302:
                navigate(response.headers.get("Location")!, "replace");
                break;
            }
        });
        return true;
    }

    function submitForm(form: HTMLFormElement, submitter?: HTMLElement | null) {
        let body : FormData | null = new FormData(form);
        const method = (submitter?.getAttribute("formmethod") || form.method || "GET").toUpperCase();
        let action = submitter?.getAttribute("formaction") || form.action;
        const historyMode = action === location.href ? "replace" : "push";
        if (method === "POST")
            return navigate(new Request(action, {body, method}), historyMode);

        const url = new URL(action);
        for (const [k, v] of body)
            url.searchParams.append(k, v.toString());
        return navigate(url.href, historyMode);
    }

    function reload() { return navigate(scope, "transparent"); }
}