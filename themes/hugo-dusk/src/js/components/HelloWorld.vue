<template>
  <div>
    the current time is {{time}}
  </div>
</template>

<script>
export default {
  data: () => ({
    currentTime: new Date(),
  }),
  mounted() {
    setInterval(() => {
      this.currentTime = new Date();
    }, 1000);
  },
  computed: {
    time() {
      return `${this.currentTime.getHours()}:${this.currentTime.getMinutes()}:${this.currentTime.getSeconds()}`;
    },
  },
};
</script>
