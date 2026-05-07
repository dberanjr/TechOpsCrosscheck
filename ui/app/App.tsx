import { Page } from "@dynatrace/strato-components-preview/layouts";
import React from "react";
import { Route, Routes } from "react-router-dom";
import { SavedPivots } from "./pages/SavedPivots";
import { Header } from "./components/Header";
import { Home } from "./pages/Home";
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
            <Route path="/" element={<Home />} />
            <Route path="/saved-pivots" element={<SavedPivots />} />
          </Routes>
        </Page.Main>
      </Page>
    </CrosscheckProvider>
  );
};
