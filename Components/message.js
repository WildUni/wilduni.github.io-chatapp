import { ref } from "vue";

function setup() {
    return {}
}

export default async () => ({
    props: ["username", "messageContent", "avatarUrl", "published"],
    setup,
    template: await fetch(new URL("./message.html", import.meta.url)).then((r) =>
        r.text(),
    ),
});
