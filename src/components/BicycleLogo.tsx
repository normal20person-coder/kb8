export default function BicycleLogo({ size = "w-5 h-5", containerSize = "w-9 h-9" }: { size?: string; containerSize?: string }) {
  return (
    <div className={`${containerSize} rounded-xl bg-gradient-to-tr from-indigo-500 to-cyan-400 flex items-center justify-center shadow-lg shadow-indigo-500/20`}>
      <svg className={`${size} text-white`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <circle cx="5.5" cy="17.5" r="3.5" strokeWidth="2" />
        <circle cx="18.5" cy="17.5" r="3.5" strokeWidth="2" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 6h3m-3 0l-3 6.5M5.5 17.5l3.5-7.5h5l3.5 7.5M9 10l-2-4H4" />
      </svg>
    </div>
  );
}
