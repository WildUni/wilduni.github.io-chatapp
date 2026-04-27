import { ref } from "vue";
import {
  GraffitiPlugin,
  useGraffiti,
  useGraffitiSession,
  useGraffitiDiscover,
} from "@graffiti-garden/wrapper-vue";

function setup() {
    const graffiti = useGraffiti();
    const session = useGraffitiSession();
    useGraffitiDiscover(
        [],
        {
        properties: {
          value: {
            required: ["activity", "id", "content", "published", "updated"],
            properties: {
              activity: { const: "Update" },
              id: { type: "string" },
              content: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    volume: { type: "number" }
                  },
                  required: ["name", "volume"]
              },
              published: { type: "number" },
              updated: { type: "number" },
            },
          },
        },
      },
        session
    )
    


    return { };
}

export default async () => ({
    setup,
    template: await fetch(new URL("./chatTree.html", import.meta.url)).then((r) =>
        r.text(),
    ),
});
