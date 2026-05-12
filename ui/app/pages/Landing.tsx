import React from "react";
import { Flex, Grid } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { Button } from "@dynatrace/strato-components/buttons";
import Colors from "@dynatrace/strato-design-tokens/colors";
import Borders from "@dynatrace/strato-design-tokens/borders";
import { Link } from "react-router-dom";
import uaGlobePng from "../../assets/ua-globe-data";
import { APP_VERSION } from "../lib/version";

export const Landing = () => {
  return (
    <Flex flexDirection="column" style={{ minHeight: "100vh", background: "rgba(240, 242, 243, 1)" }}>
      {/* ─── Hero Banner ──────────────────────────────────────────────────────*/}
      <div
        style={{
          background: "linear-gradient(135deg, #001848 0%, #003087 52%, #0050A8 100%)",
          padding: "60px 32px",
          textAlign: "center",
          position: "relative",
          overflow: "hidden",
          boxShadow: "0 12px 48px rgba(0,24,72,0.28)",
        }}
      >
        {/* Subtle gradient overlay for depth */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "radial-gradient(circle at 20% 50%, rgba(255,255,255,0.05) 0%, transparent 60%)",
            pointerEvents: "none",
          }}
        />

        <div style={{ position: "relative", zIndex: 1, maxWidth: 800, margin: "0 auto" }}>
          {/* Logo */}
          <img
            src={uaGlobePng}
            alt="United Airlines logo"
            style={{
              width: 120,
              height: 120,
              objectFit: "contain",
              display: "block",
              margin: "0 auto 20px",
              filter: "drop-shadow(0 8px 16px rgba(0,0,0,0.2))",
            }}
          />

          {/* Main title */}
          <Heading level={1} style={{ color: "#fff", margin: 0, fontSize: 52, fontWeight: 800, letterSpacing: "-1px", lineHeight: 1.1 }}>
            TechOps Crosscheck
          </Heading>

          {/* Tagline */}
          <Text style={{ color: "rgba(255,255,255,0.85)", fontSize: 18, marginTop: 12, fontWeight: 500, lineHeight: 1.5 }}>
            Surface regressions. Quantify impact.
          </Text>

          {/* Version badge */}
          <div style={{ marginTop: 20, display: "flex", justifyContent: "center", gap: 8, alignItems: "center" }}>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "1px",
                color: "rgba(255,255,255,0.6)",
              }}
            >
              Version
            </span>
            <span
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: "#fff",
                background: "rgba(255,255,255,0.15)",
                padding: "4px 12px",
                borderRadius: 20,
                border: "1px solid rgba(255,255,255,0.25)",
              }}
            >
              {APP_VERSION}
            </span>
          </div>
        </div>
      </div>

      {/* ─── Main content ─────────────────────────────────────────────────────*/}
      <Flex flexDirection="column" gap={32} padding={40} style={{ flex: 1, maxWidth: 1200, margin: "0 auto", width: "100%" }}>

        {/* ─── What is it? ──────────────────────────────────────────────────*/}
        <section>
          <Heading level={2} style={{ color: Colors.Text.Neutral.Default, marginBottom: 12, fontSize: 28, fontWeight: 700 }}>
            About
          </Heading>
          <Text style={{ color: Colors.Text.Neutral.Default, fontSize: 15, lineHeight: 1.8, maxWidth: 700, opacity: 0.8 }}>
            TechOps Crosscheck is a real-time operations analytics platform that bridges observability and business impact. It correlates technical metrics from Dynatrace with financial data from ServiceNow, transforming raw problem counts into quantified business risk — measured in dollars at risk, not just incidents per day.
          </Text>
          <Text style={{ color: Colors.Text.Neutral.Default, fontSize: 15, lineHeight: 1.8, maxWidth: 700, opacity: 0.8, marginTop: 12 }}>
            Pick a deployment date, compare problem metrics before and after, and instantly see whether your change improved or degraded reliability — with defensible numbers for leadership.
          </Text>
        </section>

        {/* ─── Two main tabs ────────────────────────────────────────────────*/}
        <section>
          <Heading level={2} style={{ color: Colors.Text.Neutral.Default, marginBottom: 20, fontSize: 28, fontWeight: 700 }}>
            Features
          </Heading>
          <Grid gridTemplateColumns="repeat(auto-fit, minmax(380px, 1fr))" gap={24}>

            {/* Live Mode card */}
            <FeatureCard
              icon="📊"
              title="Live Mode"
              description="Real-time dashboard of active problems across your portfolio. Monitor problem severity, revenue at risk, root causes, and app health instantly with auto-refresh every 60 seconds."
              highlights={[
                "Portfolio health honeycomb — see all apps at a glance",
                "Revenue at risk — quantified financial exposure",
                "Top root causes — clickable filters to narrow down",
                "Hero metrics — active problems, critical count, avg duration",
                "Problem table with drill-down detail sheets",
              ]}
              cta="View Live"
              ctaLink="/live"
              accentColor="#C82D40"
            />

            {/* Crosscheck card */}
            <FeatureCard
              icon="🔍"
              title="Crosscheck"
              description="Before-and-after regression hunting. Set a pivot date, select a time window, and instantly see which applications improved or regressed — quantified by problem count, MTTR, and revenue impact."
              highlights={[
                "Before/after comparison — set your own pivot date",
                "Tier rollup — health summary by tier (T1, T2, T3, T4)",
                "Root cause aggregation — which entity broke the most",
                "Worst-day analysis — spot peak problem days",
                "Per-CI detail table with historical trends",
              ]}
              cta="Start Analysis"
              ctaLink="/crosscheck"
              accentColor="#1C5BE5"
            />
          </Grid>
        </section>

        {/* ─── Business value ──────────────────────────────────────────────*/}
        <section style={{ background: "linear-gradient(135deg, rgba(20,150,255,0.06) 0%, rgba(200,45,64,0.04) 100%)", borderRadius: Borders.Radius.Container.Default, padding: 32, border: "1px solid rgba(28,91,229,0.15)" }}>
          <Heading level={2} style={{ color: Colors.Text.Neutral.Default, marginBottom: 20, fontSize: 28, fontWeight: 700 }}>
            Executive Value
          </Heading>
          <Grid gridTemplateColumns="repeat(auto-fit, minmax(260px, 1fr))" gap={20}>
            <ValueProp
              number="1"
              title="Faster Incident Response"
              description="Within minutes of a deployment, see exactly which apps broke and their business impact — no manual correlation needed."
            />
            <ValueProp
              number="2"
              title="Quantified Reliability"
              description="Every problem is tagged with revenue at risk. Prioritize fixes based on business cost, not just alert count."
            />
            <ValueProp
              number="3"
              title="Defensible Decision Making"
              description="Show leadership before/after metrics for any change — deployment, migration, tuning. Data-driven proof of improvement."
            />
            <ValueProp
              number="4"
              title="Portfolio Visibility"
              description="One dashboard for the entire application portfolio. Directors see their tier at a glance. Ops teams drill to root cause."
            />
            <ValueProp
              number="5"
              title="Trend Tracking"
              description="Save pivot analyses. Track reliability over time across sprints, quarters, and releases. Measure the ROI of reliability investments."
            />
            <ValueProp
              number="6"
              title="Shift to Proactive"
              description="Instead of reacting to user tickets hours later, ops teams see problems in real time and context them within seconds."
            />
          </Grid>
        </section>

        {/* ─── Key insights ─────────────────────────────────────────────────*/}
        <section>
          <Heading level={2} style={{ color: Colors.Text.Neutral.Default, marginBottom: 20, fontSize: 28, fontWeight: 700 }}>
            Key Metrics
          </Heading>
          <Grid gridTemplateColumns="repeat(auto-fit, minmax(200px, 1fr))" gap={16}>
            {[
              { label: "Revenue at Risk", icon: "$", color: "#C82D40", desc: "Estimated daily financial loss from active problems" },
              { label: "Problem Count", icon: "⚠️", color: "#1C5BE5", desc: "Active Dynatrace problems correlated by root cause" },
              { label: "MTTR", icon: "⏱️", color: "#F5A800", desc: "Mean time to resolve from open to close" },
              { label: "Root Cause", icon: "🎯", color: "#9B59B6", desc: "Top entity drivers across the portfolio" },
            ].map((m) => (
              <div key={m.label} style={{ padding: 16, borderRadius: Borders.Radius.Container.Default, background: Colors.Background.Surface.Default, border: `1px solid ${m.color}33` }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>{m.icon}</div>
                <Text style={{ fontSize: 13, fontWeight: 700, color: m.color, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 4 }}>
                  {m.label}
                </Text>
                <Text style={{ fontSize: 12, color: Colors.Text.Neutral.Default, opacity: 0.6, lineHeight: 1.5 }}>
                  {m.desc}
                </Text>
              </div>
            ))}
          </Grid>
        </section>

        {/* ─── CTA ─────────────────────────────────────────────────────────*/}
        <section style={{ textAlign: "center", paddingTop: 20, paddingBottom: 40, borderTop: `1px solid ${Colors.Text.Neutral.Default}22` }}>
          <Text style={{ fontSize: 14, color: Colors.Text.Neutral.Default, opacity: 0.7, marginBottom: 20 }}>
            Ready to surface regressions and quantify impact?
          </Text>
          <Flex gap={12} justifyContent="center" flexFlow="wrap">
            <Button as={Link} to="/live" variant="emphasized" style={{ fontSize: 14, padding: "10px 28px" }}>
              → Go to Live Mode
            </Button>
            <Button as={Link} to="/crosscheck" variant="default" style={{ fontSize: 14, padding: "10px 28px" }}>
              → Start Regression Analysis
            </Button>
          </Flex>
        </section>

      </Flex>

      {/* ─── Footer ───────────────────────────────────────────────────────*/}
      <div style={{ padding: "16px 24px", borderTop: `1px solid ${Colors.Text.Neutral.Default}11`, textAlign: "center", background: Colors.Background.Surface.Default }}>
        <Text style={{ fontSize: 11, color: Colors.Text.Neutral.Default, opacity: 0.5 }}>
          TechOps Crosscheck v{APP_VERSION} · Dynatrace Application for United Airlines
        </Text>
      </div>
    </Flex>
  );
};

// ─── Components ────────────────────────────────────────────────────────────

const FeatureCard = ({
  icon,
  title,
  description,
  highlights,
  cta,
  ctaLink,
  accentColor,
}: {
  icon: string;
  title: string;
  description: string;
  highlights: string[];
  cta: string;
  ctaLink: string;
  accentColor: string;
}) => (
  <div
    style={{
      borderRadius: Borders.Radius.Container.Default,
      background: Colors.Background.Surface.Default,
      border: `1px solid ${accentColor}33`,
      overflow: "hidden",
      display: "flex",
      flexDirection: "column",
      transition: "all 0.3s ease",
      boxShadow: `0 2px 8px ${accentColor}11`,
      height: "100%",
    }}
    onMouseEnter={(e) => {
      const el = e.currentTarget as HTMLElement;
      el.style.boxShadow = `0 8px 24px ${accentColor}22, inset 0 0 0 1px ${accentColor}22`;
      el.style.transform = "translateY(-2px)";
    }}
    onMouseLeave={(e) => {
      const el = e.currentTarget as HTMLElement;
      el.style.boxShadow = `0 2px 8px ${accentColor}11`;
      el.style.transform = "translateY(0)";
    }}
  >
    {/* Header with accent bar */}
    <div style={{ padding: "20px 24px", borderBottom: `3px solid ${accentColor}` }}>
      <div style={{ fontSize: 28, marginBottom: 8 }}>{icon}</div>
      <Heading level={3} style={{ color: Colors.Text.Neutral.Default, margin: 0, marginBottom: 8, fontSize: 20, fontWeight: 700 }}>
        {title}
      </Heading>
      <Text style={{ color: Colors.Text.Neutral.Default, opacity: 0.7, fontSize: 13, lineHeight: 1.6 }}>
        {description}
      </Text>
    </div>

    {/* Highlights */}
    <div style={{ flex: 1, padding: "16px 24px" }}>
      <Text style={{ fontSize: 11, fontWeight: 700, color: accentColor, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 12 }}>
        Highlights
      </Text>
      <ul style={{ margin: 0, paddingLeft: 0, display: "flex", flexDirection: "column", gap: 8 }}>
        {highlights.map((h, i) => (
          <li key={i} style={{ listStyle: "none", display: "flex", gap: 8 }}>
            <span style={{ color: accentColor, fontWeight: 700, flexShrink: 0 }}>·</span>
            <Text style={{ fontSize: 12, color: Colors.Text.Neutral.Default, opacity: 0.75, lineHeight: 1.5 }}>
              {h}
            </Text>
          </li>
        ))}
      </ul>
    </div>

    {/* CTA button */}
    <div style={{ padding: "16px 24px", borderTop: `1px solid ${Colors.Text.Neutral.Default}11` }}>
      <Button as={Link} to={ctaLink} variant="emphasized" style={{ width: "100%", justifyContent: "center", fontSize: 13 }}>
        {cta}
      </Button>
    </div>
  </div>
);

const ValueProp = ({ number, title, description }: { number: string; title: string; description: string }) => (
  <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
    <div
      style={{
        minWidth: 40,
        width: 40,
        height: 40,
        borderRadius: "50%",
        background: "linear-gradient(135deg, #1C5BE5 0%, #0B6BC9 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#fff",
        fontWeight: 700,
        fontSize: 16,
        flexShrink: 0,
      }}
    >
      {number}
    </div>
    <div style={{ flex: 1 }}>
      <Text style={{ fontSize: 13, fontWeight: 700, color: Colors.Text.Neutral.Default, marginBottom: 4 }}>
        {title}
      </Text>
      <Text style={{ fontSize: 12, color: Colors.Text.Neutral.Default, opacity: 0.65, lineHeight: 1.6 }}>
        {description}
      </Text>
    </div>
  </div>
);
