import React from 'react';

// 临时诊断浮层：排查 iOS 全屏 PWA 软键盘弹出时的视口数值。确认根因后整个文件删除。
// 位置：可视区顶部往下 130px —— iOS 26/27 全屏 PWA 顶栏有模糊层会糊掉贴顶的文字，
// 往下避开它；同时离键盘足够远，键盘弹出时仍留在可视区内。
// 自身用 translateY(offsetTop) 跟住可视区，否则键盘 pan 页面时它自己也会被顶出屏幕看不见。
const VISIBLE_TOP_GAP_PX = 130;

const KeyboardDiagnostic: React.FC = () => {
    const [collapsed, setCollapsed] = React.useState(false);
    const [rows, setRows] = React.useState<[string, string][]>([]);
    const [offsetTop, setOffsetTop] = React.useState(0);

    React.useEffect(() => {
        const read = () => {
            const vv = window.visualViewport;
            const cs = getComputedStyle(document.documentElement);
            const nav = navigator as Navigator & { standalone?: boolean };
            const off = vv ? Math.round(vv.offsetTop) : 0;
            setOffsetTop(off);
            setRows([
                ['innerH', String(Math.round(window.innerHeight))],
                ['vv.height', vv ? String(Math.round(vv.height)) : 'n/a'],
                ['vv.offsetTop', vv ? String(off) : 'n/a'],
                ['vv.pageTop', vv ? String(Math.round(vv.pageTop)) : 'n/a'],
                ['scrollY', String(Math.round(window.scrollY))],
                ['--app-height', cs.getPropertyValue('--app-height').trim() || '-'],
                ['safe-bottom', cs.getPropertyValue('--standalone-safe-area-bottom').trim() || '-'],
                ['safe-top', cs.getPropertyValue('--standalone-safe-area-top').trim() || '-'],
                ['kb-open class', document.body.classList.contains('ios-keyboard-open') ? 'YES' : 'no'],
                ['standalone', (window.matchMedia?.('(display-mode: standalone)').matches || !!nav.standalone) ? 'YES' : 'no'],
            ]);
        };

        read();
        const vv = window.visualViewport;
        const onFocusOut = () => window.setTimeout(read, 220);
        vv?.addEventListener('resize', read);
        vv?.addEventListener('scroll', read);
        window.addEventListener('resize', read);
        document.addEventListener('focusin', read);
        document.addEventListener('focusout', onFocusOut);
        const timer = window.setInterval(read, 350);

        return () => {
            vv?.removeEventListener('resize', read);
            vv?.removeEventListener('scroll', read);
            window.removeEventListener('resize', read);
            document.removeEventListener('focusin', read);
            document.removeEventListener('focusout', onFocusOut);
            window.clearInterval(timer);
        };
    }, []);

    return (
        <div
            onClick={() => setCollapsed(c => !c)}
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                zIndex: 2147483647,
                transform: `translateY(${offsetTop + VISIBLE_TOP_GAP_PX}px)`,
                background: 'rgba(0,0,0,0.9)',
                color: '#7dffa8',
                font: '12px/1.4 ui-monospace, Menlo, monospace',
                padding: collapsed ? '4px 8px' : '7px 10px',
                borderRadius: '0 8px 8px 0',
                pointerEvents: 'auto',
                maxWidth: '62vw',
                whiteSpace: 'pre',
            }}
        >
            {collapsed
                ? 'KB◦'
                : rows.map(([k, v]) => `${k.padEnd(14, ' ')}${v}`).join('\n')}
        </div>
    );
};

export default KeyboardDiagnostic;
