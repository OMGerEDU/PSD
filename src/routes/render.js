import { getTemplate } from "../repos/templateRepo.js";
import { validateSlotsExist, composeImage } from "../core/compositor.js";

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validateBody(body) {
  if (!isObject(body)) {
    return { success: false, error: "body must be an object" };
  }

  const { templateId, replacements, outputFormat } = body;

  if (typeof templateId !== "string" || templateId.trim().length === 0) {
    return { success: false, error: "templateId must be a non-empty string" };
  }

  if (!isObject(replacements) || Object.keys(replacements).length === 0) {
    return { success: false, error: "replacements must contain at least one entry" };
  }

  const normalizedReplacements = {};
  for (const [key, value] of Object.entries(replacements)) {
    if (typeof value !== "string" || value.length === 0) {
      return { success: false, error: `replacement for '${key}' must be a string URL` };
    }
    normalizedReplacements[key] = value;
  }

  if (outputFormat !== undefined && outputFormat !== "png" && outputFormat !== "jpeg") {
    return { success: false, error: "outputFormat must be 'png' or 'jpeg'" };
  }

  return {
    success: true,
    data: {
      templateId,
      replacements: normalizedReplacements,
      outputFormat: outputFormat === undefined ? undefined : outputFormat
    }
  };
}

export function renderRoute(app) {
  app.post("/render", async (req, res) => {
    const validation = validateBody(req.body);
    if (!validation.success) {
      return res.status(400).send({ error: "bad_request", message: validation.error });
    }

    const { templateId, replacements, outputFormat } = validation.data;

    try {
      const template = await getTemplate(templateId);
      validateSlotsExist(template.map, replacements);
      const templateMap = JSON.parse(JSON.stringify(template.map));
      if (outputFormat) {
        templateMap.output = templateMap.output ?? { format: outputFormat };
        templateMap.output.format = outputFormat;
      }

      const buffer = await composeImage(template.templateUrl, templateMap, replacements);
      const contentType = templateMap.output?.format === "jpeg" ? "image/jpeg" : "image/png";
      res.header("content-type", contentType);
      res.send(buffer);
    } catch (error) {
      res.status(400).send({ error: "render_failed", message: error?.message ?? "unknown error" });
    }
  });
}
