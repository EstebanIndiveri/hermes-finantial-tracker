"use client";

import { useEffect, useState } from "react";
import { CheckCircle, XCircle, X } from "lucide-react";

export type ToastType = "success" | "error";

interface ToastProps {
  message: string;
  type: ToastType;
  onClose: () => void;
  duration?: number;
}

export function Toast({ message, type, onClose, duration = 4000 }: ToastProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);

  useEffect(() => {
    // Trigger enter animation
    requestAnimationFrame(() => setIsVisible(true));

    // Auto dismiss
    const timer = setTimeout(() => {
      setIsLeaving(true);
      setTimeout(onClose, 300);
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onClose]);

  const handleClose = () => {
    setIsLeaving(true);
    setTimeout(onClose, 300);
  };

  const isSuccess = type === "success";

  return (
    <div
      style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "14px 18px",
        borderRadius: 12,
        background: isSuccess 
          ? "linear-gradient(135deg, #065f46 0%, #047857 100%)" 
          : "linear-gradient(135deg, #7f1d1d 0%, #991b1b 100%)",
        color: "white",
        fontSize: "0.9rem",
        fontWeight: 500,
        boxShadow: "0 10px 40px rgba(0,0,0,0.3), 0 4px 12px rgba(0,0,0,0.2)",
        transform: isVisible && !isLeaving 
          ? "translateY(0) scale(1)" 
          : "translateY(20px) scale(0.95)",
        opacity: isVisible && !isLeaving ? 1 : 0,
        transition: "all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
        backdropFilter: "blur(8px)",
        border: `1px solid ${isSuccess ? "rgba(134, 239, 172, 0.3)" : "rgba(252, 165, 165, 0.3)"}`,
        maxWidth: 360,
      }}
    >
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: "50%",
          background: isSuccess ? "rgba(134, 239, 172, 0.2)" : "rgba(252, 165, 165, 0.2)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {isSuccess ? (
          <CheckCircle style={{ width: 16, height: 16, color: "#86efac" }} />
        ) : (
          <XCircle style={{ width: 16, height: 16, color: "#fca5a5" }} />
        )}
      </div>
      
      <span style={{ flex: 1, lineHeight: 1.4 }}>{message}</span>
      
      <button
        onClick={handleClose}
        style={{
          background: "rgba(255,255,255,0.1)",
          border: "none",
          borderRadius: 6,
          padding: 4,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "background 0.2s",
          flexShrink: 0,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.2)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.1)")}
      >
        <X style={{ width: 14, height: 14, color: "rgba(255,255,255,0.8)" }} />
      </button>

      {/* Progress bar */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 3,
          borderRadius: "0 0 12px 12px",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: "100%",
            height: "100%",
            background: isSuccess ? "#86efac" : "#fca5a5",
            animation: `shrink ${duration}ms linear forwards`,
            transformOrigin: "left",
          }}
        />
      </div>

      <style jsx>{`
        @keyframes shrink {
          from { transform: scaleX(1); }
          to { transform: scaleX(0); }
        }
      `}</style>
    </div>
  );
}

interface ToastContainerProps {
  toasts: Array<{ id: string; message: string; type: ToastType }>;
  onRemove: (id: string) => void;
}

export function ToastContainer({ toasts, onRemove }: ToastContainerProps) {
  return (
    <>
      {toasts.map((toast, index) => (
        <div
          key={toast.id}
          style={{
            position: "fixed",
            bottom: 24 + index * 70,
            right: 24,
            zIndex: 9999 - index,
          }}
        >
          <Toast
            message={toast.message}
            type={toast.type}
            onClose={() => onRemove(toast.id)}
          />
        </div>
      ))}
    </>
  );
}
