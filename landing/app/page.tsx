'use client'; // For framer-motion

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Mic, ScanText, Kanban, ArrowRight, Play, CheckCircle2, Building2, HardHat, TrendingUp, Bot } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { useState } from "react";
import { supabase } from "@/lib/supabase";

function LeadForm() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setLoading(true);
    setStatus("idle");

    try {
      const { error } = await supabase
        .from('landing_leads')
        .insert([{ email, interest: 'generic_interest' }]);

      if (error) throw error;
      setStatus("success");
      setEmail("");
    } catch (err) {
      console.error(err);
      setStatus("error");
    } finally {
      setLoading(false);
    }
  };

  if (status === "success") {
    return (
      <div className="p-6 bg-green-500/10 border border-green-500/20 rounded-lg text-center">
        <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-2" />
        <h3 className="text-xl font-bold text-white mb-1">Recebido!</h3>
        <p className="text-muted-foreground">Entraremos em contato em breve.</p>
        <Button variant="link" onClick={() => setStatus("idle")} className="text-green-400 mt-2">
          Enviar outro email
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 w-full max-w-md mx-auto">
      <div className="flex flex-col sm:flex-row gap-3">
        <Input
          type="email"
          placeholder="Seu melhor e-mail"
          className="bg-white/5 border-white/10 text-white placeholder:text-slate-500 h-12"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <Button
          type="submit"
          disabled={loading}
          className="h-12 bg-blue-600 hover:bg-blue-500 text-white font-medium px-6"
        >
          {loading ? "Enviando..." : "Começar Agora"}
        </Button>
      </div>
      {status === "error" && (
        <p className="text-red-400 text-sm p-2 bg-red-500/10 rounded border border-red-500/20">
          Erro ao enviar. Tente novamente.
        </p>
      )}
      <p className="text-xs text-slate-500 text-center">
        Teste grátis de 14 dias. Sem cartão de crédito.
      </p>
    </form>
  );
}

export default function Home() {
  const features = [
    {
      image: "/features/ocr_new.png",
      useFullHeader: true,
      title: "OCR Inteligente",
      description: "Digitalize recibos, notas fiscais e documentos automaticamente. O sistema corrige dados com precisão e organiza tudo instantaneamente.",
      gradient: "from-cyan-500 to-blue-600",
      shadow: "shadow-cyan-500/20",
      iconBg: "bg-cyan-500/10"
    },
    {
      image: "/features/all_features.jpg",
      position: "right top", // Top Right: Assistente de Voz
      title: "Comandos de Voz",
      description: "Controle sua obra sem usar as mãos. Dite relatórios, atualize o cronograma e busque informações críticas apenas falando.",
      gradient: "from-emerald-500 to-green-600",
      shadow: "shadow-emerald-500/20",
      iconBg: "bg-emerald-500/10"
    },
    {
      image: "/features/visual_new.png",
      useFullHeader: true,
      title: "Gestão Visual",
      description: "Acompanhe o progresso total do projeto com funções inteligentes e completas em tempo real. Veja a margem de lucro e saiba extamente como esta indo sua obra ou investimento.",
      gradient: "from-orange-500 to-amber-600",
      shadow: "shadow-orange-500/20",
      iconBg: "bg-orange-500/10"
    },
    {
      image: "/features/all_features.jpg",
      position: "right bottom", // Bottom Right: IA
      title: "Assistente de IA",
      description: "Sua inteligência artificial pessoal que analisa despesas, custos e o andamento da obra, oferecendo insights valiosos para tomada de decisão.",
      gradient: "from-purple-500 to-violet-600",
      shadow: "shadow-purple-500/20",
      iconBg: "bg-purple-500/10"
    }
  ];

  return (
    <div className="min-h-screen bg-[#0f172a] text-foreground flex flex-col selection:bg-blue-500/30 overflow-x-hidden">
      {/* Global Background Effects */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        {/* Reduced blurs on mobile for better performance */}
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-600/10 rounded-full blur-[60px] md:blur-[120px] opacity-70 md:opacity-100" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-green-500/10 rounded-full blur-[60px] md:blur-[120px] opacity-70 md:opacity-100" />
        <div className="absolute top-[20%] left-[50%] -translate-x-1/2 w-[60%] h-[60%] bg-indigo-500/5 rounded-full blur-[80px] md:blur-[150px]" />
        {/* Grid Pattern */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]" />
      </div>

      {/* Navbar */}
      <header className="fixed top-0 w-full z-50 border-b border-white/5 bg-[#0f172a]/70 backdrop-blur-xl">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Image
              src="/logo.png"
              alt="Obra Pro Logo"
              width={32}
              height={32}
              className="rounded-lg"
            />
            <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-green-400">
              Obra Pro
            </span>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
            <Link href="#features" className="hover:text-white transition-colors">Funcionalidades</Link>
            <Link href="#benefits" className="hover:text-white transition-colors">Para quem é</Link>
            <Link href="#pricing" className="hover:text-white transition-colors">Preços</Link>
          </nav>
          <div className="flex items-center gap-4">
            <Link href="https://obrapro-app.vercel.app" target="_blank" className="text-sm font-medium hover:text-primary transition-colors">
              Login
            </Link>
            <Button className="bg-primary hover:bg-blue-600 text-white shadow-lg shadow-blue-500/20" asChild>
              <Link href="#lead-form">Começar Grátis</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 pt-12">
        {/* Hero Section */}
        <section className="relative px-4 pb-20 lg:pb-32 overflow-hidden">
          <div className="container mx-auto relative">
            {/* Main Hero Container with Background Image */}
            <div className="relative w-full rounded-[2.5rem] overflow-hidden min-h-[600px] flex items-center justify-center border border-white/10 shadow-2xl">
              {/* Background Image */}
              <div className="absolute inset-0 z-0">
                <Image
                  src="/hero_bg_new.jpg"
                  alt="Gestão de Obras Completa"
                  fill
                  className="object-cover"
                  priority
                  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 90vw, 1200px"
                  quality={85}
                />
                {/* Dark Overlay for Readability */}
                <div className="absolute inset-0 bg-[#0f172a]/70 backdrop-blur-[2px]" />
                {/* Gradient Accents */}
                <div className="absolute inset-0 bg-gradient-to-b from-blue-600/10 via-transparent to-[#0f172a]/40" />
              </div>

              <div className="relative z-10 text-center px-4 py-20">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5 }}
                >
                  <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight mb-6 text-white text-shadow-lg leading-tight">
                    Gestão de Obras <br />
                    <span className="bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 via-green-400 to-emerald-500 font-extrabold drop-shadow-[0_0_15px_rgba(52,211,153,0.3)]">
                      Inteligente
                    </span>
                  </h1>
                  <p className="text-lg md:text-xl text-slate-200 max-w-3xl mx-auto mb-10 font-medium leading-relaxed">
                    Controle de alto nível para investidores, gestão impecável para construtores. Transforme cada dado da sua obra em lucro real com nossa Inteligência Artificial aplicada.
                  </p>

                  <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                    <Button size="lg" className="h-14 px-10 text-lg bg-blue-600 hover:bg-blue-500 hover:scale-105 transition-all duration-300 border-0 shadow-[0_0_30px_-5px_rgba(59,130,246,0.6)] rounded-full" asChild>
                      <Link href="#lead-form">Testar Gratuitamente <ArrowRight className="ml-2 w-5 h-5" /></Link>
                    </Button>
                    <Button size="lg" variant="outline" className="h-14 px-10 text-lg bg-white/10 border-white/20 hover:bg-white/20 hover:border-white/40 text-white rounded-full backdrop-blur-md transition-all" asChild>
                      <Link href="#demo-video"><Play className="mr-2 w-5 h-5 fill-white" /> Ver Demonstração</Link>
                    </Button>
                  </div>
                </motion.div>
              </div>
            </div>
          </div>
        </section>

        <section className="container mx-auto px-4 -mt-16 relative z-20">
          {/* Features Grid (Moved Up) */}
          <div id="features" className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-32 text-left">
            {features.map((feature, index) => (
              <motion.div
                key={index}
                whileHover={{ y: -8, scale: 1.02 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
                className="group relative"
              >
                {/* Glowing Backlight Effect */}
                <div className={`absolute -inset-1 rounded-[2.2rem] bg-gradient-to-b ${feature.gradient} opacity-20 group-hover:opacity-60 blur-xl transition-all duration-500`} />

                {/* Gradient Border Container */}
                <div className={`relative h-full rounded-[2rem] p-[1px] bg-gradient-to-b from-white/20 to-transparent group-hover:from-white/40 transition-all duration-500 overflow-hidden`}>

                  {/* The Main Card Background */}
                  <Card className="relative h-full bg-[#0b1121]/90 backdrop-blur-2xl border-0 rounded-[2rem] overflow-hidden flex flex-col">

                    {/* Full Image Header */}
                    <div className="relative w-full h-52 overflow-hidden bg-slate-900">
                      {feature.useFullHeader ? (
                        <Image
                          src={feature.image}
                          alt={feature.title}
                          fill
                          className="object-cover transform group-hover:scale-110 transition-transform duration-700"
                          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                          quality={80}
                        />
                      ) : (
                        <div className="relative w-full h-full transform group-hover:scale-110 transition-transform duration-700">
                          <Image
                            src={feature.image}
                            alt={feature.title}
                            fill
                            className="object-cover"
                            style={{
                              objectPosition: feature.position || 'center',
                              scale: '1.5' // Approximating the 202% background-size zoom
                            }}
                            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                            quality={80}
                          />
                        </div>
                      )}
                      {/* Gradient Overlays for Polish and Readability */}
                      <div className={`absolute inset-0 bg-gradient-to-b ${feature.gradient} opacity-20 z-10`} />
                      <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#0b1121] to-transparent z-20" />
                    </div>

                    <CardHeader className="pt-4 pb-4 relative z-30 flex flex-col items-center text-center">
                      <CardTitle className="text-xl font-bold text-white mb-2 group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-white group-hover:to-slate-300 transition-all">
                        {feature.title}
                      </CardTitle>

                      {/* Animated Underline */}
                      <div className={`w-12 h-1 bg-gradient-to-r ${feature.gradient} rounded-full opacity-50 group-hover:w-24 transition-all duration-500`} />
                    </CardHeader>

                    <CardContent className="text-center pb-10 px-6 relative z-30">
                      <p className="text-slate-400 text-sm leading-relaxed font-medium group-hover:text-slate-300 transition-colors">
                        {feature.description}
                      </p>
                    </CardContent>
                  </Card>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Video Placeholder */}
          <motion.div
            id="demo-video"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2, duration: 0.5 }}
            className="relative max-w-5xl mx-auto rounded-xl border border-white/10 shadow-2xl overflow-hidden bg-slate-900/50 backdrop-blur-sm aspect-video group cursor-pointer"
          >
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 group-hover:bg-black/20 transition-all">
              <div className="w-20 h-20 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/20 shadow-lg group-hover:scale-110 transition-transform">
                <Play className="w-8 h-8 fill-white text-white ml-1" />
              </div>
            </div>
            {/* Simulated UI Mockup (Placeholder for actual video/image) */}
            <div className="w-full h-full flex items-center justify-center text-slate-500">
              [Vídeo de Demonstração do App rodando aqui]
            </div>
          </motion.div>
        </section>

        {/* Social Proof Section */}
        <section className="py-20 border-y border-white/5 bg-black/20">
          <div className="container mx-auto px-4 text-center">
            <p className="text-sm font-medium text-slate-500 mb-8 uppercase tracking-widest">
              A escolha inteligente para
            </p>
            <div className="flex flex-wrap justify-center items-center gap-12 opacity-70">
              <div className="flex items-center gap-2 text-slate-300 font-semibold text-xl">
                <Building2 className="w-6 h-6 text-blue-500" /> Construtores
              </div>
              <div className="flex items-center gap-2 text-slate-300 font-semibold text-xl">
                <HardHat className="w-6 h-6 text-orange-500" /> Profissionais
              </div>
              <div className="flex items-center gap-2 text-slate-300 font-semibold text-xl">
                <TrendingUp className="w-6 h-6 text-green-500" /> Investidores
              </div>
            </div>
          </div>
        </section>

        {/* CTA / Lead Form Section */}
        <section id="lead-form" className="py-24 relative overflow-hidden">
          <div className="absolute inset-0 bg-blue-600/5 -z-10" />
          <div className="absolute -right-20 bottom-0 w-96 h-96 bg-blue-500/20 rounded-full blur-[100px] -z-10" />

          <div className="container mx-auto px-4">
            <div className="max-w-3xl mx-auto text-center mb-10">
              <h2 className="text-3xl md:text-5xl font-bold mb-6">
                Pronto para transformar suas obras?
              </h2>
              <p className="text-xl text-muted-foreground mb-8">
                Junte-se a centenas de construtores e investidores que já economizam tempo e dinheiro com o Obra Pro.
              </p>
              <LeadForm />
            </div>
          </div>
        </section>

      </main>

      <footer className="py-10 border-t border-white/10 bg-black/40 text-center text-muted-foreground text-sm">
        <p>&copy; 2026 Obra Pro. Todos os direitos reservados.</p>
      </footer>
    </div>
  );
}

