import { useState } from "react";

const formatTime = () =>
  new Date().toLocaleTimeString("en-US", { hour12: false });

const randomMs = () => Math.floor(Math.random() * 100 + 200);
const randomRate = () => (97 + Math.random() * 2).toFixed(1);

export default function DrakoYudaDashboard() {
  const [running, setRunning] = useState(false);
  const [metrics, setMetrics] = useState({ time: 242, rate: "98.5" });
  const [logs, setLogs] = useState([
    { id: 1, time: "08:00:01", msg: "System initialized" },
    { id: 2, time: "08:00:03", msg: "Execution lab ready" },
    { id: 3, time: "08:00:05", msg: "Awaiting commands" },
  ]);

  const handleRunTest = () => {
    if (running) return;
    setRunning(true);
    const startTime = formatTime();
    setLogs((prev) => [
      ...prev,
      { id: Date.now(), time: startTime, msg: "Test execution started..." },
    ]);

    setTimeout(() => {
      const ms = randomMs();
      const rate = randomRate();
      setMetrics({ time: ms, rate });
      setLogs((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          time: formatTime(),
          msg: `Test completed — ${ms}ms / ${rate}% success`,
        },
      ]);
      setRunning(false);
    }, 1200);
  };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6 font-mono">
      {/* Header */}
      <header className="mb-8 border-b-2 pb-4" style={{ borderColor: "#D4AF37" }}>
        <h1 className="text-3xl font-bold" style={{ color: "#D4AF37" }}>
          DrakoYuda Dashboard
        </h1>
        <p className="text-sm mt-1 text-gray-400">Execution Lab Control Center</p>
      </header>

      {/* Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        {/* Status Card */}
        <div
          className="rounded-xl p-5 border"
          style={{ backgroundColor: "#0f1a13", borderColor: "#2D5F3F" }}
        >
          <p className="text-xs uppercase tracking-widest text-gray-400 mb-3">Status</p>
          <div className="flex items-center gap-2">
            <span
              className="w-3 h-3 rounded-full animate-pulse"
              style={{ backgroundColor: "#2D5F3F", boxShadow: "0 0 6px #2D5F3F" }}
            />
            <span className="text-xl font-semibold" style={{ color: "#2D5F3F" }}>
              Active
            </span>
          </div>
        </div>

        {/* Metrics Card */}
        <div
          className="rounded-xl p-5 border"
          style={{ backgroundColor: "#0f1a13", borderColor: "#2D5F3F" }}
        >
          <p className="text-xs uppercase tracking-widest text-gray-400 mb-3">Metrics</p>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-400 text-sm">Execution Time</span>
              <span className="font-semibold" style={{ color: "#D4AF37" }}>
                {metrics.time}ms
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400 text-sm">Success Rate</span>
              <span className="font-semibold" style={{ color: "#D4AF37" }}>
                {metrics.rate}%
              </span>
            </div>
          </div>
        </div>

        {/* Actions Card */}
        <div
          className="rounded-xl p-5 border"
          style={{ backgroundColor: "#0f1a13", borderColor: "#2D5F3F" }}
        >
          <p className="text-xs uppercase tracking-widest text-gray-400 mb-3">Actions</p>
          <button
            onClick={handleRunTest}
            disabled={running}
            className="w-full py-2 rounded-lg font-semibold text-sm transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              backgroundColor: running ? "#1a3a26" : "#2D5F3F",
              color: "#D4AF37",
              border: "1px solid #D4AF37",
            }}
          >
            {running ? "Running..." : "Run Test"}
          </button>
        </div>
      </div>

      {/* Activity Log */}
      <div
        className="rounded-xl p-5 border"
        style={{ backgroundColor: "#0f1a13", borderColor: "#2D5F3F" }}
      >
        <p className="text-xs uppercase tracking-widest text-gray-400 mb-4">Activity Log</p>
        <ul className="space-y-2 max-h-48 overflow-y-auto pr-1">
          {logs.map((entry) => (
            <li key={entry.id} className="flex gap-3 text-sm">
              <span className="shrink-0 text-gray-500">[{entry.time}]</span>
              <span className="text-gray-200">{entry.msg}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
