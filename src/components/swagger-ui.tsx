"use client";

import SwaggerUIReact from "swagger-ui-react";
import "swagger-ui-react/swagger-ui.css";
import openapi from "@/../public/openapi.json";

export default function SwaggerUI() {
  return (
    <SwaggerUIReact
      spec={openapi}
      persistAuthorization={true}
      tryItOutEnabled={true}
      displayRequestDuration={true}
      docExpansion="list"
      defaultModelsExpandDepth={-1}
      requestInterceptor={(req) => {
        const url = new URL(req.url, window.location.origin);
        return {
          ...req,
          url: url.toString(),
          credentials: "same-origin",
          cache: "no-store",
        };
      }}
    />
  );
}
