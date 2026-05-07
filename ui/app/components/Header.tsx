import React from "react";
import { Link } from "react-router-dom";
import { AppHeader } from "@dynatrace/strato-components-preview/layouts";

export const Header = () => {
  return (
    <AppHeader>
      <AppHeader.Navigation>
        <AppHeader.Logo as={Link} to="/" />
        <AppHeader.NavigationItem as={Link} to="/">
          Crosscheck
        </AppHeader.NavigationItem>
        <AppHeader.NavigationItem as={Link} to="/saved-pivots">
          Saved Pivots
        </AppHeader.NavigationItem>
      </AppHeader.Navigation>
    </AppHeader>
  );
};
