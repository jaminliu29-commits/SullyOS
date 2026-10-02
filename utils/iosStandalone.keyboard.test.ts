/// <reference types="vitest" />
/**
 * utils/iosStandalone.keyboard.test.ts — 键盘态布局的回归守卫。
 *
 * 背景：iOS 全屏 PWA 下 body 高度会比可视区多出一段底部安全区（给 home 条留位）。
 * 键盘弹出时 app 高度保持不变（内容继续铺到键盘底下，避免半透明候选条背后透出桌布，
 * 也避免逐帧改高度导致整棵树 reflow），改由 --keyboard-inset 把内容区底边抬到键盘上缘。
 *
 * 这里钉住的不变式：
 * ① 键盘态只认 visualViewport 真的变矮，不认焦点事件；
 * ② 进键盘态时 --app-height 不动，只有 --keyboard-inset 变。
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const SCREEN_H = 852; // 竖屏可视高度
const SAFE_BOTTOM = 34; // home 条安全区
const SAFE_TOP = 44;
const KEYBOARD_H = 336;

type Listener = () => void;
let vvListeners: Record<string, Listener[]>;
let visualViewport: { height: number; offsetTop: number; addEventListener: (t: string, fn: Listener) => void; removeEventListener: () => void };

const setupIOSStandalone = () => {
    vvListeners = { resize: [], scroll: [] };
    visualViewport = {
        height: SCREEN_H,
        offsetTop: 0,
        addEventListener: (type: string, fn: Listener) => { (vvListeners[type] ||= []).push(fn); },
        removeEventListener: () => {},
    };
    Object.defineProperty(window, 'visualViewport', { value: visualViewport, configurable: true, writable: true });
    Object.defineProperty(window, 'innerHeight', { value: SCREEN_H, configurable: true, writable: true });
    Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15',
        configurable: true,
    });
    window.matchMedia = ((query: string) => ({
        matches: query.includes('standalone'),
        media: query,
        onchange: null,
        addListener: () => {}, removeListener: () => {},
        addEventListener: () => {}, removeEventListener: () => {},
        dispatchEvent: () => false,
    })) as typeof window.matchMedia;
    window.scrollTo = vi.fn() as typeof window.scrollTo;

    // jsdom 不认 env()，安全区探针会读到 0，那段 34px 溢出区就不存在、用例也就测不到错位。
    // 认出探针（fixed + hidden 的临时 div）后返回真机数值，其余元素照常走 jsdom。
    const realGetComputedStyle = window.getComputedStyle.bind(window);
    vi.spyOn(window, 'getComputedStyle').mockImplementation(((el: Element, pseudo?: string | null) => {
        const style = (el as HTMLElement).style;
        if (style?.position === 'fixed' && style?.visibility === 'hidden') {
            return { paddingTop: `${SAFE_TOP}px`, paddingBottom: `${SAFE_BOTTOM}px` } as CSSStyleDeclaration;
        }
        return realGetComputedStyle(el as Element, pseudo as string | undefined);
    }) as typeof window.getComputedStyle);
};

/** 重新加载模块再装载，绕开「只装一次」的单例标志，顺带清掉基线高度等模块级状态。 */
const install = async () => {
    vi.resetModules();
    const mod = await import('./iosStandalone');
    mod.installIOSStandaloneWorkaround();
    return mod;
};

const emitViewportResize = (height: number) => {
    visualViewport.height = height;
    vvListeners.resize.forEach(fn => fn());
};

const focusTextarea = () => {
    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    textarea.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    return textarea;
};

const appHeight = () => document.documentElement.style.getPropertyValue('--app-height');
const keyboardInset = () => document.documentElement.style.getPropertyValue('--keyboard-inset');
const inKeyboardMode = () => document.body.classList.contains('ios-keyboard-open');

describe('iOS 全屏 PWA 键盘态', () => {
    beforeEach(() => {
        document.body.className = '';
        document.body.innerHTML = '';
        document.documentElement.removeAttribute('style');
        setupIOSStandalone();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('键盘态允许输入框内部滑动与选区，同时继续拦截外层拖动', async () => {
        await install();
        const textarea = focusTextarea();
        emitViewportResize(SCREEN_H - KEYBOARD_H);
        const inside = new Event('touchmove', { bubbles: true, cancelable: true });
        textarea.dispatchEvent(inside);
        expect(inside.defaultPrevented).toBe(false);
        const outside = new Event('touchmove', { bubbles: true, cancelable: true });
        document.body.dispatchEvent(outside);
        expect(outside.defaultPrevented).toBe(true);
    });

    it('无键盘时 app 高度 = 可视高度 + 底部安全区（那段溢出区留给 home 条）', async () => {
        await install();
        expect(appHeight()).toBe(`${SCREEN_H + SAFE_BOTTOM}px`);
        expect(inKeyboardMode()).toBe(false);
    });

    // 回归守卫：输入框拿到焦点不等于键盘弹出来了。设备上键盘弹不出来时（外接键盘、输入法异常），
    // 焦点照样进得来但可视区纹丝不动，此时就让位的话这一屏会被顶在半空、底部空出一大块。
    it('焦点进来但可视区没变矮 → 不进键盘态，不让位', async () => {
        await install();
        focusTextarea();

        expect(inKeyboardMode()).toBe(false);
        expect(keyboardInset()).toBe('0px');
        expect(appHeight()).toBe(`${SCREEN_H + SAFE_BOTTOM}px`);
    });

    // 回归守卫：键盘态下 app 高度必须保持不变。一旦改回「高度跟随可视区」，外壳就会在键盘上缘截断，
    // iOS 半透明候选条背后透出外壳底下的桌布（看起来像输入栏和键盘裂开），
    // 且键盘动画期每次 visualViewport resize 都会让整棵树 reflow，肉眼就是「闪一下」。
    it('可视区真的变矮 → 标记和 keyboard-inset 一起进键盘态，app 高度不动', async () => {
        await install();
        focusTextarea();
        emitViewportResize(SCREEN_H - KEYBOARD_H);

        expect(inKeyboardMode()).toBe(true);
        expect(appHeight()).toBe(`${SCREEN_H + SAFE_BOTTOM}px`);
        // 让位量按外壳全高（含挂在屏幕外的那段安全区）算，否则输入栏会少让一个 SAFE_BOTTOM、沉到键盘底下。
        expect(keyboardInset()).toBe(`${KEYBOARD_H + SAFE_BOTTOM}px`);
    });

    // 回归守卫：聚焦中的输入框被 React 卸载时（退出聊天页），WebKit 不派发 focusout。
    // 旧实现只有 focusout 能摘标记，于是标记永久卡在 body 上，全局界面底部一直错位。
    it('输入框被直接移除、没有 focusout → 键盘收起后标记不残留', async () => {
        await install();
        const textarea = focusTextarea();
        emitViewportResize(SCREEN_H - KEYBOARD_H);
        expect(inKeyboardMode()).toBe(true);

        textarea.remove();
        emitViewportResize(SCREEN_H);

        expect(inKeyboardMode()).toBe(false);
        expect(appHeight()).toBe(`${SCREEN_H + SAFE_BOTTOM}px`);
        expect(keyboardInset()).toBe('0px');
    });

    it('键盘动画期可视高度报脏值 → 退化成无键盘态，不把布局撑崩', async () => {
        await install();
        focusTextarea();
        emitViewportResize(80);

        expect(inKeyboardMode()).toBe(false);
        expect(keyboardInset()).toBe('0px');
        expect(appHeight()).toBe(`${SCREEN_H + SAFE_BOTTOM}px`);
    });

    it.each(['Android Chrome', 'iPhone Safari'])('浏览器平移不抵消键盘高度：%s', async userAgent => {
        Object.defineProperty(navigator, 'userAgent', { value: userAgent, configurable: true });
        const originalMatchMedia = window.matchMedia;
        window.matchMedia = query => ({ ...originalMatchMedia(query), matches: false });
        await install();
        visualViewport.offsetTop = KEYBOARD_H;
        emitViewportResize(SCREEN_H - KEYBOARD_H);
        expect(inKeyboardMode()).toBe(true);
        expect(appHeight()).toBe(`${SCREEN_H - KEYBOARD_H}px`);
        visualViewport.offsetTop = 0;
        emitViewportResize(SCREEN_H);
        expect(inKeyboardMode()).toBe(false);
        expect(appHeight()).toBe(`${SCREEN_H}px`);
    });
});
