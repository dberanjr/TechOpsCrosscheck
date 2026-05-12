import { Page } from "@dynatrace/strato-components-preview/layouts";
import React from "react";
import { Route, Routes } from "react-router-dom";
import { SavedPivots } from "./pages/SavedPivots";
import { Header } from "./components/Header";
import { Landing } from "./pages/Landing";
import { Home } from "./pages/Home";
import { LiveMode } from "./pages/LiveMode";
import { MttrTrend } from "./pages/MttrTrend";
import { ObservabilityHealth } from "./pages/ObservabilityHealth";
import { CrosscheckProvider } from "./context/CrosscheckContext";

export const App = () => {
  return (
    <CrosscheckProvider>
      <Page>
        <Page.Header>
          <Header />
        </Page.Header>
        <Page.Main>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/crosscheck" element={<Home />} />
            <Route path="/live" element={<LiveMode />} />
            <Route path="/mttr-trend" element={<MttrTrend />} />
            <Route path="/obs-health" element={<ObservabilityHealth />} />
            <Route path="/saved-pivots" element={<SavedPivots />} />
          </Routes>
        </Page.Main>
      </Page>
    </CrosscheckProvider>
  );
};
