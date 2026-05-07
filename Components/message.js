function setup() {
    function isToday(date) {
        const today = new Date();

        return date.getFullYear() === today.getFullYear()
            && date.getMonth() === today.getMonth()
            && date.getDate() === today.getDate();
    }

    function formatMessageTimestamp(published) {
        const date = new Date(published);

        if (isToday(date)) {
            return date.toLocaleTimeString("en-US", {
                hour: "numeric",
                minute: "2-digit"
            });
        }

        return date.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric"
        });
    }

    return { formatMessageTimestamp }
}

export default async () => ({
    props: ["username", "messageContent", "avatarUrl", "published", "isOwnMessage", "showName", "showAvatar"],
    setup,
    template: await fetch(new URL("./message.html", import.meta.url)).then((r) =>
        r.text(),
    ),
});
