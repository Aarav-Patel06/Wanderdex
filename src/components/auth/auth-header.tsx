import Image from "next/image";

// Logo, name, and tagline at the top of /login and /signup (SPEC §14.5).
export function AuthHeader() {
  return (
    <header className="flex flex-col items-center gap-4 text-center">
      {/* 32×32 sprite at 3× */}
      <Image
        src="/sprites/passport.png"
        alt=""
        width={96}
        height={96}
        unoptimized
        className="pixelated"
      />
      <h1>WANDERDEX</h1>
      <p>Collect places. Build your world.</p>
    </header>
  );
}
