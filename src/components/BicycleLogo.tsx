export default function BicycleLogo({ size = "w-5 h-5", containerSize = "w-9 h-9" }: { size?: string; containerSize?: string }) {
  return (
    <div className={`relative ${containerSize} rounded-xl bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-400 p-[1px] shadow-lg shadow-emerald-500/20 group hover:shadow-emerald-500/40 transition-all duration-300`}>
      <div className="w-full h-full rounded-[11px] bg-[#061811] flex items-center justify-center backdrop-blur-md relative overflow-hidden">
        {/* Subtle interior glow */}
        <div className="absolute inset-0 bg-gradient-to-tr from-emerald-500/10 to-teal-400/20 opacity-80 group-hover:opacity-100 transition-opacity" />
        
        {/* Bio-Dewdrop Mesh Node Icon */}
        <svg className={`${size} text-emerald-400 relative z-10 drop-shadow-[0_0_8px_rgba(52,211,153,0.8)]`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75 0 7.312 9.75 10.75 9.75 10.75s9.75-3.438 9.75-10.75c0-5.385-4.365-9.75-9.75-9.75z" />
          <circle cx="12" cy="11" r="3.25" fill="currentColor" opacity="0.3" />
          <circle cx="12" cy="11" r="1.75" fill="currentColor" className="animate-pulse" />
        </svg>
      </div>
    </div>
  );
}
