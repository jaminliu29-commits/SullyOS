
import React from 'react';
import { OSProvider } from './context/OSContext';
import { MusicProvider } from './context/MusicContext';
import PhoneShell from './components/PhoneShell';
import BuildBadge from './components/BuildBadge';
import DevDebugPanel from './components/DevDebugPanel';
import Amsg2DebugPanel from './components/Amsg2DebugPanel';
import VRBroadcast from './components/VRBroadcast';
import WorldBroadcast from './components/WorldBroadcast';
import ChatBroadcast from './components/ChatBroadcast';
import KeyboardDiagnostic from './components/KeyboardDiagnostic';

import { installDevDebugLifecycleCapture } from './utils/devDebug';

const App: React.FC = () => {
  React.useEffect(() => {
    // 常驻监听前后台 / 焦点 / 网络事件；抓不抓由 devDebug 的 lifecycle 类勾选决定
    installDevDebugLifecycleCapture();
  }, []);

  return (
    <>
      {/* Always use fixed outer shell so that --app-height (set by iosStandalone.ts
          when the keyboard opens) actually controls the visible area. A relative outer
          div is ignored by the inner fixed div, so keyboard avoidance never worked in
          browser (non-standalone) mode. With fixed+absolute the inner div fills the
          outer div and shrinks with it when JS updates --app-height. */}
      <div
        className="fixed top-0 left-0 right-0 w-full bg-transparent overflow-hidden"
        style={{ height: 'var(--app-height, 100dvh)' }}
      >
        <div
          className="absolute inset-0 w-full h-full z-0 bg-transparent"
          style={{ transform: 'translateZ(0)' }}
        >
          <OSProvider>
            <MusicProvider>
              <PhoneShell />
            </MusicProvider>
            {/* 挂在 Provider 里面才能直接读 characters（省掉轮询 IndexedDB），
                面板自身用 portal 渲染到 body，绕开上面那层 transform 对 fixed 定位的影响。 */}
            <Amsg2DebugPanel />
          </OSProvider>
        </div>
      </div>
      <BuildBadge />
      <DevDebugPanel />
      <VRBroadcast />
      <WorldBroadcast />
      <ChatBroadcast />
      <KeyboardDiagnostic />
    </>
  );
};

export default App;
