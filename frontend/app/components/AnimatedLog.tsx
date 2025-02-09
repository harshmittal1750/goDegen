import { motion } from "framer-motion";

interface AnimatedLogProps {
  message: string;
  type: "info" | "success" | "warning" | "error";
  timestamp: number;
}

const getLogColor = (type: AnimatedLogProps["type"]) => {
  switch (type) {
    case "error":
      return "bg-red-900/20 text-red-400 border-red-800";
    case "warning":
      return "bg-yellow-900/20 text-yellow-400 border-yellow-800";
    case "success":
      return "bg-green-900/20 text-green-400 border-green-800";
    default:
      return "bg-blue-900/20 text-blue-400 border-blue-800";
  }
};

const getLogIcon = (type: AnimatedLogProps["type"]) => {
  switch (type) {
    case "error":
      return "❌";
    case "warning":
      return "⚠️";
    case "success":
      return "✅";
    default:
      return "ℹ️";
  }
};

export function AnimatedLog({ message, type, timestamp }: AnimatedLogProps) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -20, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 20, scale: 0.95 }}
      transition={{ duration: 0.2 }}
      className={`p-2 rounded border ${getLogColor(
        type
      )} font-mono relative overflow-hidden`}
    >
      <motion.div
        className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent"
        initial={{ x: "-100%" }}
        animate={{ x: "100%" }}
        transition={{
          duration: 1,
          repeat: Infinity,
          repeatType: "loop",
          ease: "linear",
        }}
      />
      <div className="flex items-center gap-2">
        <span className="text-xs opacity-50">
          {new Date(timestamp).toLocaleTimeString()}
        </span>
        <span>{getLogIcon(type)}</span>
        <span className="flex-1">{message}</span>
      </div>
    </motion.div>
  );
}

export function AnimatedLogContainer({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <motion.div
      className="space-y-2 relative"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="absolute -inset-2 bg-gradient-to-r from-blue-500/20 via-purple-500/20 to-pink-500/20 rounded-lg blur-xl"
        animate={{
          scale: [1, 1.1, 1],
          opacity: [0.3, 0.5, 0.3],
        }}
        transition={{
          duration: 4,
          repeat: Infinity,
          repeatType: "reverse",
        }}
      />
      <div className="relative">{children}</div>
    </motion.div>
  );
}

export function AnimatedValue({
  value,
  label,
  trend,
}: {
  value: string | number;
  label: string;
  trend?: "up" | "down" | "neutral";
}) {
  return (
    <motion.div
      className="p-4 rounded-lg bg-black/50 backdrop-blur-sm border border-white/10"
      initial={{ scale: 0.95, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.2 }}
    >
      <motion.p
        className="text-sm text-gray-400"
        initial={{ y: 10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.1 }}
      >
        {label}
      </motion.p>
      <motion.div
        className="flex items-center gap-2"
        initial={{ y: 10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2 }}
      >
        <p
          className={`text-lg font-bold ${
            trend === "up"
              ? "text-green-400"
              : trend === "down"
              ? "text-red-400"
              : "text-blue-400"
          }`}
        >
          {value}
          {trend && (
            <span className="ml-2">
              {trend === "up" ? "↗" : trend === "down" ? "↘" : "→"}
            </span>
          )}
        </p>
      </motion.div>
      <motion.div
        className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent"
        initial={{ x: "-100%" }}
        animate={{ x: "100%" }}
        transition={{
          duration: 2,
          repeat: Infinity,
          repeatType: "loop",
          ease: "linear",
        }}
      />
    </motion.div>
  );
}

export function AnimatedCard({
  children,
  glowColor = "blue",
}: {
  children: React.ReactNode;
  glowColor?: "blue" | "green" | "red" | "purple";
}) {
  const getGlowStyles = () => {
    switch (glowColor) {
      case "green":
        return "from-green-500/20 via-green-500/10 to-transparent";
      case "red":
        return "from-red-500/20 via-red-500/10 to-transparent";
      case "purple":
        return "from-purple-500/20 via-purple-500/10 to-transparent";
      default:
        return "from-blue-500/20 via-blue-500/10 to-transparent";
    }
  };

  return (
    <motion.div
      className="relative rounded-lg overflow-hidden"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <motion.div
        className={`absolute inset-0 bg-gradient-to-r ${getGlowStyles()} blur-xl`}
        animate={{
          scale: [1, 1.1, 1],
          opacity: [0.3, 0.5, 0.3],
        }}
        transition={{
          duration: 4,
          repeat: Infinity,
          repeatType: "reverse",
        }}
      />
      <div className="relative bg-black/50 backdrop-blur-sm p-6 rounded-lg border border-white/10">
        {children}
      </div>
    </motion.div>
  );
}

export function AnimatedTitle({ children }: { children: React.ReactNode }) {
  return (
    <motion.h3
      className="text-xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent"
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      {children}
    </motion.h3>
  );
}
