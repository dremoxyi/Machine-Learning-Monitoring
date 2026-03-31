<script setup lang="ts">
if (typeof window !== 'undefined') {
  window.location.replace('/connexion.html')
}
</script>

<template>
  <main>
    <p>Redirection vers la page de connexion...</p>
    <p><a href="/connexion.html">Continuer</a></p>
  </main>
</template>

<style scoped>
main {
  min-height: 100vh;
  display: grid;
  place-content: center;
  text-align: center;
  font-family: Arial, sans-serif;
  gap: 10px;
}

a {
  color: #2563eb;
}
</style>
